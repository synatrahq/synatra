import { randomUUID } from "crypto"
import type { WebSocket } from "ws"
import { principal, setConnectorStatus, setConnectorMetadata, setConnectorLastSeen } from "@synatra/core"
import { verifyConnectorStillValid, type ConnectorInfo } from "./connector-auth"
import {
  acquireOwnership,
  releaseOwnership,
  isOwnedLocally,
  isConnectorOnlineInCluster,
  getLocalOwnershipCount,
  isOwnershipValid,
} from "./ownership"
import { dispatchRemoteCommand, publishReply, startCommandConsumer } from "./command-stream"
import { getRedis, isRedisEnabled } from "./redis-client"
import type { ConnectorMessage, CloudCommand, RegisterPayload, ResultPayload, ErrorPayload } from "./ws-types"

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

interface ConnectorConnection {
  ws: WebSocket
  info: ConnectorInfo
  metadata?: RegisterPayload
  tokenVersion: number
  fence: number
}

const connections = new Map<string, ConnectorConnection>()
const pendingRequests = new Map<string, PendingRequest>()
const commandConsumerStops = new Map<string, () => void>()
const replyToMap = new Map<string, string>()

const COMMAND_TIMEOUT_MS = 30000
const HEARTBEAT_INTERVAL_MS = 30000
function tokenVersionKey(connectorId: string): string {
  return `connector:${connectorId}:tokenVersion`
}

async function getTokenVersion(connectorId: string): Promise<number> {
  if (!isRedisEnabled()) return 0

  const redis = await getRedis()
  if (!redis) return 0

  const version = await redis.get(tokenVersionKey(connectorId))
  return version ? parseInt(version, 10) : 0
}

export async function incrementTokenVersion(connectorId: string): Promise<number> {
  if (!isRedisEnabled()) return 0

  const redis = await getRedis()
  if (!redis) return 0

  return redis.incr(tokenVersionKey(connectorId))
}

export async function registerConnection(ws: WebSocket, info: ConnectorInfo): Promise<boolean> {
  const { acquired, fence } = await acquireOwnership(info.id)
  if (!acquired) {
    ws.close(4004, "Connector owned by another instance")
    return false
  }

  const existing = connections.get(info.id)
  if (existing) {
    const stop = commandConsumerStops.get(info.id)
    if (stop) {
      stop()
      commandConsumerStops.delete(info.id)
    }
    existing.ws.close(1000, "Replaced by new connection")
  }

  const tokenVersion = await getTokenVersion(info.id)
  connections.set(info.id, { ws, info, tokenVersion, fence })
  principal.withSystem({ organizationId: info.organizationId }, () =>
    setConnectorStatus({ connectorId: info.id, status: "online" }),
  )

  if (isRedisEnabled()) {
    const stop = await startCommandConsumer(info.id, async (command) => {
      const conn = connections.get(info.id)
      if (!conn) {
        console.warn(`[Coordinator] No connection for ${info.id}, will retry`)
        return false
      }
      const valid = await isOwnershipValid(info.id, conn.fence)
      if (!valid) return false
      replyToMap.set(command.correlationId, command.replyTo)
      setTimeout(() => replyToMap.delete(command.correlationId), COMMAND_TIMEOUT_MS + 5000)
      conn.ws.send(JSON.stringify({ ...command, replyTo: undefined }))
      return true
    })
    commandConsumerStops.set(info.id, stop)
  }

  return true
}

export async function unregisterConnection(connectorId: string, ws?: WebSocket): Promise<void> {
  const current = connections.get(connectorId)
  if (!current) return
  if (ws && current.ws !== ws) return

  const stop = commandConsumerStops.get(connectorId)
  if (stop) {
    stop()
    commandConsumerStops.delete(connectorId)
  }

  const organizationId = current.info.organizationId
  connections.delete(connectorId)
  await releaseOwnership(connectorId)
  principal.withSystem({ organizationId }, () => setConnectorStatus({ connectorId, status: "offline" }))
}

export async function handleMessage(connectorId: string, message: ConnectorMessage): Promise<void> {
  const conn = connections.get(connectorId)
  if (!conn) return

  switch (message.type) {
    case "register": {
      conn.metadata = message.payload as RegisterPayload
      setConnectorMetadata({ connectorId, metadata: conn.metadata })
      break
    }
    case "heartbeat": {
      if (isRedisEnabled()) {
        const currentVersion = await getTokenVersion(connectorId)
        if (currentVersion > conn.tokenVersion) {
          conn.tokenVersion = currentVersion
        }
      }
      const valid = await verifyConnectorStillValid(connectorId, conn.info.tokenHash)
      if (!valid) {
        console.log(`Connector ${connectorId} token invalidated, closing connection`)
        conn.ws.close(4003, "Token invalidated")
        await unregisterConnection(connectorId)
        return
      }
      principal.withSystem({ organizationId: conn.info.organizationId }, () => setConnectorLastSeen(connectorId))
      break
    }
    case "result": {
      if (!message.correlationId) break

      const replyTo = replyToMap.get(message.correlationId)
      if (replyTo) {
        replyToMap.delete(message.correlationId)
        await publishReply(message.correlationId, replyTo, message.payload as ResultPayload)
        break
      }

      const pending = pendingRequests.get(message.correlationId)
      if (pending) {
        clearTimeout(pending.timeout)
        pendingRequests.delete(message.correlationId)
        pending.resolve(message.payload as ResultPayload)
      }
      break
    }
    case "error": {
      if (!message.correlationId) break

      const replyToErr = replyToMap.get(message.correlationId)
      if (replyToErr) {
        replyToMap.delete(message.correlationId)
        await publishReply(message.correlationId, replyToErr, message.payload as ErrorPayload, true)
        break
      }

      const pending = pendingRequests.get(message.correlationId)
      if (pending) {
        clearTimeout(pending.timeout)
        pendingRequests.delete(message.correlationId)
        const error = message.payload as ErrorPayload
        pending.reject(new Error(error.message))
      }
      break
    }
  }
}

export async function dispatchCommand<T>(
  connectorId: string,
  command: Omit<CloudCommand, "correlationId">,
): Promise<T> {
  if (isOwnedLocally(connectorId)) {
    const conn = connections.get(connectorId)
    if (!conn) throw new Error(`Connector ${connectorId} is not connected`)
    return dispatchLocal<T>(conn, command)
  }

  if (!isRedisEnabled()) {
    throw new Error(`Connector ${connectorId} is not connected`)
  }

  return dispatchRemoteCommand<T>(connectorId, command)
}

async function dispatchLocal<T>(conn: ConnectorConnection, command: Omit<CloudCommand, "correlationId">): Promise<T> {
  const correlationId = randomUUID()
  const fullCommand: CloudCommand = { ...command, correlationId }

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(correlationId)
      reject(new Error(`Command timeout after ${COMMAND_TIMEOUT_MS}ms`))
    }, COMMAND_TIMEOUT_MS)

    pendingRequests.set(correlationId, {
      resolve: resolve as (value: unknown) => void,
      reject,
      timeout,
    })

    conn.ws.send(JSON.stringify(fullCommand))
  })
}

export async function isConnectorOnline(connectorId: string): Promise<boolean> {
  if (connections.has(connectorId)) return true
  return isConnectorOnlineInCluster(connectorId)
}

export function getConnectorStatus(connectorId: string): "online" | "offline" {
  return connections.has(connectorId) ? "online" : "offline"
}

export function broadcastPing(): void {
  for (const [, conn] of connections) {
    const ping: CloudCommand = {
      type: "ping",
      correlationId: randomUUID(),
      payload: {} as any,
    }
    conn.ws.send(JSON.stringify(ping))
  }
}

export function startHeartbeatInterval(): ReturnType<typeof setInterval> {
  return setInterval(broadcastPing, HEARTBEAT_INTERVAL_MS)
}

export function stats(): { connectedCount: number; pendingRequests: number; localOwnership: number } {
  return {
    connectedCount: connections.size,
    pendingRequests: pendingRequests.size,
    localOwnership: getLocalOwnershipCount(),
  }
}

export function clearPendingRequests(): void {
  for (const [, pending] of pendingRequests) {
    clearTimeout(pending.timeout)
    pending.reject(new Error("Shutting down"))
  }
  pendingRequests.clear()
  replyToMap.clear()
}

export async function closeAllConnections(): Promise<void> {
  for (const [connectorId, conn] of connections) {
    conn.ws.close(1001, "Server shutting down")
    await unregisterConnection(connectorId)
  }
}
