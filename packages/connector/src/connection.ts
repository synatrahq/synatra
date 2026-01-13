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

let ws: WebSocket | null = null
let config: ConnectionConfig | null = null
let reconnectAttempts = 0
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

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
    reconnectAttempts = 0
    sendRegister()
    startHeartbeat()
  }

  ws.onmessage = async (event) => {
    const data = typeof event.data === "string" ? event.data : await event.data.text()
    const cmd = JSON.parse(data) as CloudCommand
    handleCommand(cmd)
  }

  ws.onclose = (event) => {
    console.log(`Connection closed: ${event.code} ${event.reason}`)
    stopHeartbeat()
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
