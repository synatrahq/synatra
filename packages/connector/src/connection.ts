import { inspect } from "util"
import { executeQuery, executeIntrospect, executeTest, executeRestApi, executeRestApiTest } from "./executor"
import type { QueryCommand, IntrospectCommand, TestCommand, RestApiCommand, RestApiTestCommand } from "./executor"

interface CloudCommand {
  type: "query" | "introspect" | "test" | "ping" | "restapi" | "shutdown_notice" | "register_ok"
  correlationId: string
  payload: unknown
}

interface ShutdownNoticePayload {
  gracePeriodMs: number
}

interface ConnectorMessage {
  type: "register" | "heartbeat" | "result" | "error"
  correlationId?: string
  payload?: unknown
}

interface ConnectionConfig {
  gatewayUrl: string
  token: string
  version: string
  platform: string
}

const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30000
const HEARTBEAT_INTERVAL_MS = 25000
const SERVER_TIMEOUT_MS = 60000
const SERVER_TIMEOUT_CHECK_MS = 10000
const STABILITY_WINDOW_MS = 30000
const PENDING_TIMEOUT_MS = 10000
const PENDING_MAX_ATTEMPTS = 3
const PENDING_FAIL_RESET_MS = 60000
const PENDING_PAUSE_MS = 30000

export function maskTokens(text: string): string {
  return text
    .replace(/([?&](?:access_token|refresh_token|token)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(token=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(authorization:\s*bearer\s+)[^\s]+/gi, "$1[redacted]")
    .replace(/(bearer\s+)[^\s]+/gi, "$1[redacted]")
    .replace(/("token"\s*:\s*")[^"]+("?)/gi, "$1[redacted]$2")
    .replace(/('token'\s*:\s*')[^']+('?)/gi, "$1[redacted]$2")
}

function formatLog(value: unknown): string {
  const raw =
    typeof value === "string"
      ? value
      : value instanceof Error
        ? (value.stack ?? value.message)
        : inspect(value, { depth: 5 })
  return maskTokens(raw)
}

let ws: WebSocket | null = null
let pendingWs: WebSocket | null = null
let config: ConnectionConfig | null = null
let reconnectAttempts = 0
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let pendingReconnectTimer: ReturnType<typeof setTimeout> | null = null
let pendingTimeoutTimer: ReturnType<typeof setTimeout> | null = null
let serverTimeoutTimer: ReturnType<typeof setInterval> | null = null
let stabilityTimer: ReturnType<typeof setTimeout> | null = null
let lastServerMessage = 0
let connectedAt = 0
let messageCount = 0
let shutdownDeadline = 0
let pendingAttempts = 0
let lastPendingFailAt = 0

export function connect(cfg: ConnectionConfig): void {
  config = cfg
  reconnectAttempts = 0
  createConnection()
}

export function disconnect(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (pendingReconnectTimer) {
    clearTimeout(pendingReconnectTimer)
    pendingReconnectTimer = null
  }
  if (pendingTimeoutTimer) {
    clearTimeout(pendingTimeoutTimer)
    pendingTimeoutTimer = null
  }
  if (serverTimeoutTimer) {
    clearInterval(serverTimeoutTimer)
    serverTimeoutTimer = null
  }
  if (stabilityTimer) {
    clearTimeout(stabilityTimer)
    stabilityTimer = null
  }
  if (pendingWs) {
    pendingWs.close(1000, "Disconnect requested")
    pendingWs = null
  }
  if (ws) {
    ws.close(1000, "Disconnect requested")
    ws = null
  }
  config = null
}

function createConnection(): void {
  if (!config) return

  const url = new URL(config.gatewayUrl)
  url.searchParams.set("token", config.token)
  ws = new WebSocket(url.toString())
  attachHandlers(ws)

  ws.onopen = () => {
    console.log("Connected to cloud")
    const current = ws
    if (!current) return
    activateConnection(current, true)
  }
}

function attachHandlers(socket: WebSocket): void {
  socket.onmessage = async (event) => {
    if (socket !== ws && socket !== pendingWs) return

    const data = typeof event.data === "string" ? event.data : await event.data.text()
    const cmd = JSON.parse(data) as CloudCommand

    if (cmd.type === "register_ok") {
      if (socket === pendingWs) {
        console.log("[WS] Pending connection register_ok received, promoting")
        promotePending(socket)
      }
      return
    }

    if (socket !== ws) return

    lastServerMessage = Date.now()
    messageCount++

    if (cmd.type === "ping") {
      console.log(`[WS] Received ping from server (message #${messageCount})`)
      return
    }

    if (cmd.type === "shutdown_notice") {
      console.log("[WS] Received shutdown notice, establishing new connection preemptively")
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      const payload = cmd.payload as ShutdownNoticePayload
      if (payload?.gracePeriodMs) {
        shutdownDeadline = Date.now() + payload.gracePeriodMs
      }

      pendingAttempts = 0
      lastPendingFailAt = 0
      startPendingConnection()

      return
    }

    handleCommand(cmd)
  }

  socket.onclose = (event) => {
    if (socket !== ws) {
      if (pendingWs === socket) {
        console.log(`[WS] Pending connection closed: ${event.code} ${event.reason || "(no reason)"}`)
        pendingWs = null
        if (pendingTimeoutTimer) {
          clearTimeout(pendingTimeoutTimer)
          pendingTimeoutTimer = null
        }
        notePendingFailure()
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          console.log("[WS] Pending connection closed, main connection unavailable, scheduling reconnect")
          scheduleReconnect(jitterDelay(1000))
        } else {
          schedulePendingReconnect(jitterDelay(1000))
        }
      }
      return
    }

    const duration = connectedAt ? Math.round((Date.now() - connectedAt) / 1000) : 0
    const lastMsg = lastServerMessage ? Math.round((Date.now() - lastServerMessage) / 1000) : -1
    console.log(
      `Connection closed: ${event.code} ${event.reason || "(no reason)"} duration=${duration}s lastServerMsg=${lastMsg}s ago messages=${messageCount}`,
    )
    stopHeartbeat()
    stopServerTimeoutCheck()
    if (stabilityTimer) {
      clearTimeout(stabilityTimer)
      stabilityTimer = null
    }
    ws = null

    switch (event.reason) {
      case "Replaced by new connection":
        console.log("[WS] Connection replaced by another instance, reconnecting")
        reconnectAttempts = 0
        scheduleReconnect(jitterDelay(1000))
        return

      case "Ownership lost":
        console.log("[WS] Ownership lost to another gateway, reconnecting")
        reconnectAttempts = 0
        scheduleReconnect(jitterDelay(1000))
        return

      case "Connector owned by another instance":
        console.log("[WS] Connector owned by another instance, reconnecting")
        reconnectAttempts = 0
        scheduleReconnect(jitterDelay(1000))
        return

      case "Connection limit exceeded":
        console.log("[WS] Connection limit exceeded, reconnecting with backoff")
        scheduleReconnect()
        return

      case "Registration failed":
        console.log("[WS] Registration failed, reconnecting")
        reconnectAttempts = 0
        scheduleReconnect(jitterDelay(1000))
        return

      case "Token invalidated":
        console.log("[WS] Token invalidated, not reconnecting")
        return

      case "Server shutting down":
        console.log("[WS] Server shutting down, reconnecting after grace period")
        reconnectAttempts = 0
        scheduleReconnect(jitterDelay(getShutdownDelayMs()))
        return

      case "Migrated to new connection":
        console.log("[WS] Connection migrated, not reconnecting from old connection")
        return

      default:
        scheduleReconnect()
    }
  }

  socket.onerror = (error) => {
    if (socket === pendingWs) {
      console.error(`[WS] Pending connection error: ${formatLog(error)}`)
      pendingWs = null
      if (pendingTimeoutTimer) {
        clearTimeout(pendingTimeoutTimer)
        pendingTimeoutTimer = null
      }
      notePendingFailure()
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.log("[WS] Pending connection error, main connection unavailable, scheduling reconnect")
        scheduleReconnect(jitterDelay(1000))
      } else {
        schedulePendingReconnect(jitterDelay(1000))
      }
      return
    }
    if (socket !== ws) return
    console.error(`WebSocket error: ${formatLog(error)}`)
  }
}

function scheduleReconnect(minDelayMs = 0): void {
  if (!config) return
  if (reconnectTimer) return

  reconnectAttempts += 1
  const delay = Math.min(Math.max(RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts - 1), minDelayMs), RECONNECT_MAX_MS)
  console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`)

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    createConnection()
  }, delay)
}

function schedulePendingReconnect(minDelayMs = 0): void {
  if (!config) return
  if (pendingReconnectTimer) return

  const delay = Math.min(Math.max(minDelayMs, 500), RECONNECT_MAX_MS)
  pendingReconnectTimer = setTimeout(() => {
    pendingReconnectTimer = null
    if (ws?.readyState === WebSocket.OPEN && !pendingWs) {
      startPendingConnection()
    }
  }, delay)
}

function notePendingFailure(): void {
  const now = Date.now()
  if (now - lastPendingFailAt > PENDING_FAIL_RESET_MS) {
    pendingAttempts = 0
  }
  pendingAttempts += 1
  lastPendingFailAt = now
}

function canStartPending(): boolean {
  if (pendingAttempts < PENDING_MAX_ATTEMPTS) return true
  return Date.now() - lastPendingFailAt > PENDING_PAUSE_MS
}

function getShutdownDelayMs(): number {
  if (!shutdownDeadline) return 0
  const remaining = shutdownDeadline - Date.now()
  return remaining > 0 ? remaining : 0
}

const JITTER_MAX_MS = 3000

function jitterDelay(baseMs: number): number {
  if (baseMs <= 0) return Math.floor(Math.random() * JITTER_MAX_MS)
  return baseMs + Math.floor(Math.random() * JITTER_MAX_MS)
}

function sendRegister(socket: WebSocket): void {
  if (!config) return

  const msg: ConnectorMessage = {
    type: "register",
    payload: {
      version: config.version,
      platform: config.platform,
      capabilities: ["postgres", "mysql", "restapi"],
    },
  }
  socket.send(JSON.stringify(msg))
}

function startHeartbeat(): void {
  stopHeartbeat()
  heartbeatTimer = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      const msg: ConnectorMessage = { type: "heartbeat" }
      ws.send(JSON.stringify(msg))
    }
  }, HEARTBEAT_INTERVAL_MS)
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

function startServerTimeoutCheck(): void {
  stopServerTimeoutCheck()
  serverTimeoutTimer = setInterval(() => {
    const elapsed = Date.now() - lastServerMessage
    if (ws?.readyState === WebSocket.OPEN && elapsed > SERVER_TIMEOUT_MS) {
      const duration = connectedAt ? Math.round((Date.now() - connectedAt) / 1000) : 0
      console.log(
        `[WS] Server timeout: no message for ${Math.round(elapsed / 1000)}s, duration=${duration}s, messages=${messageCount}, reconnecting...`,
      )
      ws.close(1000, "Server timeout")
    }
  }, SERVER_TIMEOUT_CHECK_MS)
}

function stopServerTimeoutCheck(): void {
  if (serverTimeoutTimer) {
    clearInterval(serverTimeoutTimer)
    serverTimeoutTimer = null
  }
}

async function handleCommand(cmd: CloudCommand): Promise<void> {
  if (cmd.type === "ping") {
    return
  }

  try {
    let result: unknown

    if (cmd.type === "query") {
      result = await executeQuery(cmd.payload as QueryCommand)
    } else if (cmd.type === "introspect") {
      result = await executeIntrospect(cmd.payload as IntrospectCommand)
    } else if (cmd.type === "test") {
      const payload = cmd.payload as { resourceType: string }
      if (payload.resourceType === "restapi") {
        result = await executeRestApiTest(cmd.payload as RestApiTestCommand)
      } else {
        result = await executeTest(cmd.payload as TestCommand)
      }
    } else if (cmd.type === "restapi") {
      result = await executeRestApi(cmd.payload as RestApiCommand)
    } else {
      throw new Error(`Unknown command type: ${cmd.type}`)
    }

    sendResult(cmd.correlationId, result)
  } catch (error) {
    sendError(cmd.correlationId, error instanceof Error ? error.message : String(error))
  }
}

function sendResult(correlationId: string, data: unknown): void {
  if (!ws) return

  const msg: ConnectorMessage = {
    type: "result",
    correlationId,
    payload: data,
  }
  ws.send(JSON.stringify(msg))
}

function sendError(correlationId: string, message: string): void {
  if (!ws) return

  const msg: ConnectorMessage = {
    type: "error",
    correlationId,
    payload: { code: "EXECUTION_ERROR", message },
  }
  ws.send(JSON.stringify(msg))
}

export function isConnected(): boolean {
  return ws?.readyState === WebSocket.OPEN
}

function startPendingConnection(): void {
  if (!config) return
  if (pendingWs) return
  if (ws?.readyState === WebSocket.OPEN && !canStartPending()) {
    console.log("[WS] Pending connection attempts exceeded, waiting before retry")
    const waitMs = Math.max(PENDING_PAUSE_MS - (Date.now() - lastPendingFailAt), 0)
    schedulePendingReconnect(jitterDelay(waitMs))
    return
  }

  const newUrl = new URL(config.gatewayUrl)
  newUrl.searchParams.set("token", config.token)
  const newWs = new WebSocket(newUrl.toString())
  pendingWs = newWs
  attachHandlers(newWs)

  newWs.onopen = () => {
    console.log("[WS] New connection established, awaiting register_ok")
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    sendRegister(newWs)
    pendingTimeoutTimer = setTimeout(() => {
      if (pendingWs === newWs) {
        console.log(
          `[WS] Pending connection timeout, closing (main=${ws?.readyState === WebSocket.OPEN ? "open" : "closed"})`,
        )
        pendingWs = null
        notePendingFailure()
        newWs.close(1000, "Pending timeout")
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          console.log("[WS] Main connection unavailable, scheduling reconnect")
          scheduleReconnect(jitterDelay(1000))
        } else {
          schedulePendingReconnect(jitterDelay(1000))
        }
      }
      pendingTimeoutTimer = null
    }, PENDING_TIMEOUT_MS)
  }
}

function promotePending(next: WebSocket): void {
  if (pendingWs !== next) return
  const currentWs = ws

  if (pendingReconnectTimer) {
    clearTimeout(pendingReconnectTimer)
    pendingReconnectTimer = null
  }
  if (pendingTimeoutTimer) {
    clearTimeout(pendingTimeoutTimer)
    pendingTimeoutTimer = null
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (stabilityTimer) {
    clearTimeout(stabilityTimer)
    stabilityTimer = null
  }

  if (currentWs && currentWs !== next) {
    currentWs.close(1000, "Migrated to new connection")
  }

  ws = next
  pendingWs = null
  pendingAttempts = 0
  lastPendingFailAt = 0
  activateConnection(next, false)
}

function activateConnection(socket: WebSocket, shouldRegister: boolean): void {
  connectedAt = Date.now()
  lastServerMessage = Date.now()
  messageCount = 0
  shutdownDeadline = 0
  pendingAttempts = 0
  lastPendingFailAt = 0
  if (stabilityTimer) {
    clearTimeout(stabilityTimer)
  }
  stabilityTimer = setTimeout(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      reconnectAttempts = 0
      console.log("[WS] Connection stable, reset backoff")
    }
    stabilityTimer = null
  }, STABILITY_WINDOW_MS)

  if (shouldRegister) {
    sendRegister(socket)
  }
  startHeartbeat()
  startServerTimeoutCheck()
}
