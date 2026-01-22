import { executeQuery, executeIntrospect, executeTest, executeRestApi, executeRestApiTest } from "./executor"
import type { QueryCommand, IntrospectCommand, TestCommand, RestApiCommand, RestApiTestCommand } from "./executor"

interface CloudCommand {
  type: "query" | "introspect" | "test" | "ping" | "restapi"
  correlationId: string
  payload: unknown
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

let ws: WebSocket | null = null
let config: ConnectionConfig | null = null
let reconnectAttempts = 0
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let serverTimeoutTimer: ReturnType<typeof setInterval> | null = null
let stabilityTimer: ReturnType<typeof setTimeout> | null = null
let lastServerMessage = 0
let connectedAt = 0
let messageCount = 0

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
  if (serverTimeoutTimer) {
    clearInterval(serverTimeoutTimer)
    serverTimeoutTimer = null
  }
  if (stabilityTimer) {
    clearTimeout(stabilityTimer)
    stabilityTimer = null
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

  ws.onopen = () => {
    console.log("Connected to cloud")
    connectedAt = Date.now()
    lastServerMessage = Date.now()
    messageCount = 0
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
    sendRegister()
    startHeartbeat()
    startServerTimeoutCheck()
  }

  ws.onmessage = async (event) => {
    lastServerMessage = Date.now()
    messageCount++
    const data = typeof event.data === "string" ? event.data : await event.data.text()
    const cmd = JSON.parse(data) as CloudCommand
    if (cmd.type === "ping") {
      console.log(`[WS] Received ping from server (message #${messageCount})`)
    }
    handleCommand(cmd)
  }

  ws.onclose = (event) => {
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
    scheduleReconnect()
  }

  ws.onerror = (error) => {
    console.error("WebSocket error:", error)
  }
}

function scheduleReconnect(): void {
  if (!config) return

  reconnectAttempts += 1
  const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts - 1), RECONNECT_MAX_MS)
  console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`)

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    createConnection()
  }, delay)
}

function sendRegister(): void {
  if (!ws || !config) return

  const msg: ConnectorMessage = {
    type: "register",
    payload: {
      version: config.version,
      platform: config.platform,
      capabilities: ["postgres", "mysql", "restapi"],
    },
  }
  ws.send(JSON.stringify(msg))
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
