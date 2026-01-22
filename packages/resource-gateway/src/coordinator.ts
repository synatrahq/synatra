import { randomUUID } from "crypto"
import { WebSocket } from "ws"
import { principal, setConnectorStatus, setConnectorMetadata, setConnectorLastSeen } from "@synatra/core"
import { verifyConnectorStillValid, type ConnectorInfo } from "./connector-auth"
import {
  acquireOwnership,
  releaseOwnership,
  releaseAllOwnership,
  isOwnedLocally,
  isConnectorOnlineInCluster,
  getLocalOwnershipCount,
  isOwnershipValid,
  onOwnershipLost,
  removeOwnershipLostCallback,
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
  tokenHash: string
  ready: boolean
  connectedAt: number
  lastSeen: number
}

interface ConnectorGroup {
  info: ConnectorInfo
  metadata?: RegisterPayload
  tokenVersion: number
  fence: number
  connections: Map<WebSocket, ConnectorConnection>
}

const connections = new Map<string, ConnectorGroup>()
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
  let group = connections.get(info.id)
  if (!group) {
    const { acquired, fence } = await acquireOwnership(info.id)
    if (!acquired) {
      ws.close(4004, "Connector owned by another instance")
      return false
    }

    const tokenVersion = await getTokenVersion(info.id)
    group = {
      info,
      tokenVersion,
      fence,
      connections: new Map(),
    }
    connections.set(info.id, group)
    principal.withSystem({ organizationId: info.organizationId }, () =>
      setConnectorStatus({ connectorId: info.id, status: "online" }),
    )
  } else {
    const validOwnership = await isOwnershipValid(info.id, group.fence)
    if (!validOwnership) {
      const { acquired, fence } = await acquireOwnership(info.id)
      if (!acquired) {
        ws.close(4004, "Connector owned by another instance")
        return false
      }
      group.fence = fence
      group.tokenVersion = await getTokenVersion(info.id)
      principal.withSystem({ organizationId: info.organizationId }, () =>
        setConnectorStatus({ connectorId: info.id, status: "online" }),
      )
    }
    group.info = info
  }

  group.connections.set(ws, {
    ws,
    tokenHash: info.tokenHash,
    ready: false,
    connectedAt: Date.now(),
    lastSeen: Date.now(),
  })
  await ensureCommandConsumer(info.id, group)
  return true
}

export async function unregisterConnection(connectorId: string, ws?: WebSocket): Promise<void> {
  const group = connections.get(connectorId)
  if (!group) return

  if (ws) {
    if (!group.connections.has(ws)) return
    group.connections.delete(ws)
    if (group.connections.size > 0) return
  }

  stopCommandConsumer(connectorId)
  removeOwnershipLostCallback(connectorId)

  const organizationId = group.info.organizationId
  connections.delete(connectorId)
  await releaseOwnership(connectorId)
  principal.withSystem({ organizationId }, () => setConnectorStatus({ connectorId, status: "offline" }))
}

export async function handleMessage(connectorId: string, ws: WebSocket, message: ConnectorMessage): Promise<void> {
  const group = connections.get(connectorId)
  if (!group) return

  const connection = group.connections.get(ws)
  if (!connection) return
  connection.lastSeen = Date.now()

  switch (message.type) {
    case "register": {
      group.metadata = message.payload as RegisterPayload
      connection.ready = true
      setConnectorMetadata({ connectorId, metadata: group.metadata })
      sendRegisterOk(connection.ws)
      break
    }
    case "heartbeat": {
      if (isRedisEnabled()) {
        const currentVersion = await getTokenVersion(connectorId)
        if (currentVersion > group.tokenVersion) {
          group.tokenVersion = currentVersion
        }
      }
      const valid = await verifyConnectorStillValid(connectorId, connection.tokenHash)
      if (!valid) {
        console.log(`Connector ${connectorId} token invalidated, closing connection`)
        connection.ws.close(4003, "Token invalidated")
        await unregisterConnection(connectorId, connection.ws)
        return
      }
      principal.withSystem({ organizationId: group.info.organizationId }, () => setConnectorLastSeen(connectorId))
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
    const group = connections.get(connectorId)
    if (!group) throw new Error(`Connector ${connectorId} is not connected`)
    return dispatchLocal<T>(connectorId, group, command)
  }

  if (!isRedisEnabled()) {
    throw new Error(`Connector ${connectorId} is not connected`)
  }

  return dispatchRemoteCommand<T>(connectorId, command)
}

async function dispatchLocal<T>(
  connectorId: string,
  group: ConnectorGroup,
  command: Omit<CloudCommand, "correlationId">,
): Promise<T> {
  const correlationId = randomUUID()
  const fullCommand: CloudCommand = { ...command, correlationId }
  const connection = pickConnection(group)
  if (!connection) {
    throw new Error(`Connector ${connectorId} is not connected`)
  }

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

    connection.ws.send(JSON.stringify(fullCommand))
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
  for (const [, group] of connections) {
    const conn = pickConnection(group)
    if (!conn) continue
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
  for (const [connectorId, group] of connections) {
    for (const connection of group.connections.values()) {
      connection.ws.close(1001, "Server shutting down")
    }
    await unregisterConnection(connectorId)
  }
}

export async function startDrain(): Promise<void> {
  stopAllCommandConsumers()
  await releaseAllOwnership()
}

async function ensureCommandConsumer(connectorId: string, group: ConnectorGroup): Promise<void> {
  if (!isRedisEnabled()) return
  if (commandConsumerStops.has(connectorId)) return

  const stop = await startCommandConsumer(connectorId, async (command) => {
    const currentGroup = connections.get(connectorId)
    if (!currentGroup) {
      console.warn(`[Coordinator] No connection for ${connectorId}, will retry`)
      return false
    }
    const valid = await isOwnershipValid(connectorId, currentGroup.fence)
    if (!valid) return false
    const conn = pickConnection(currentGroup)
    if (!conn) {
      console.warn(`[Coordinator] No active connection for ${connectorId}, will retry`)
      return false
    }
    replyToMap.set(command.correlationId, command.replyTo)
    setTimeout(() => replyToMap.delete(command.correlationId), COMMAND_TIMEOUT_MS + 5000)
    conn.ws.send(JSON.stringify({ ...command, replyTo: undefined }))
    return true
  })
  if (!stop) return
  commandConsumerStops.set(connectorId, stop)
  onOwnershipLost(connectorId, () => {
    const currentGroup = connections.get(connectorId)
    if (currentGroup) {
      console.log(`[Coordinator] Ownership lost for ${connectorId}, closing WebSocket`)
      closeConnections(connectorId, 4006, "Ownership lost")
      stopCommandConsumer(connectorId)
    }
  })
}

function stopCommandConsumer(connectorId: string): void {
  if (!commandConsumerStops.has(connectorId)) return
  const stop = commandConsumerStops.get(connectorId)
  if (stop) stop()
  commandConsumerStops.delete(connectorId)
}

function pickConnection(group: ConnectorGroup): ConnectorConnection | null {
  let selected: ConnectorConnection | null = null
  for (const conn of group.connections.values()) {
    if (!conn.ready) continue
    if (conn.ws.readyState !== WebSocket.OPEN) continue
    if (!selected || conn.connectedAt > selected.connectedAt) {
      selected = conn
    }
  }
  return selected
}

function closeConnections(connectorId: string, code: number, reason: string): void {
  const group = connections.get(connectorId)
  if (!group) return
  for (const connection of group.connections.values()) {
    connection.ws.close(code, reason)
  }
}

function stopAllCommandConsumers(): void {
  for (const connectorId of commandConsumerStops.keys()) {
    stopCommandConsumer(connectorId)
  }
}

function sendRegisterOk(ws: WebSocket): void {
  const message = {
    type: "register_ok",
    correlationId: randomUUID(),
    payload: { ready: true },
  }
  ws.send(JSON.stringify(message))
}
