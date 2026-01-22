import { createServer } from "http"
import { randomUUID } from "crypto"
import { serve } from "@hono/node-server"
import { WebSocketServer, WebSocket, RawData } from "ws"
import { initEncryption } from "@synatra/util/crypto"
import { app } from "./server"
import * as coordinator from "./coordinator"
import { verifyConnectorToken, type ConnectorInfo } from "./connector-auth"
import type { ConnectorMessage } from "./ws-types"
import { config } from "./config"
import { shutdown, isShuttingDown, markShuttingDown } from "./shutdown"
import { isRedisEnabled } from "./redis-client"
import { startReplyConsumer } from "./command-stream"

interface AliveWebSocket extends WebSocket {
  isAlive: boolean
  connectorId?: string
  connectorName?: string
  connectedAt?: number
  lastPongAt?: number
  missedPongCount?: number
}

function processMessage(connectorId: string, ws: WebSocket, data: RawData): void {
  let msg: ConnectorMessage
  try {
    msg = JSON.parse(data.toString()) as ConnectorMessage
  } catch (err) {
    console.error(`Invalid JSON from ${connectorId}:`, (err as Error).message)
    return
  }
  coordinator.handleMessage(connectorId, ws, msg).catch((err) => {
    console.error(`Error handling message from ${connectorId}:`, err.message)
  })
}

const gatewayConfig = config()
initEncryption(gatewayConfig.encryptionKey)

const port = gatewayConfig.port
const internalPort = gatewayConfig.internalPort
let redisReady = !isRedisEnabled()

async function initializeRedis(): Promise<void> {
  if (!isRedisEnabled()) {
    console.log("[Redis] Mode: off (single instance)")
    redisReady = true
    return
  }

  console.log(`[Redis] Mode: redis, Instance ID: ${gatewayConfig.instanceId}`)
  await startReplyConsumer()
  console.log("[Redis] Reply consumer started")
  redisReady = true
}

initializeRedis().catch((err) => {
  redisReady = false
  console.error("[Redis] Failed to initialize:", err.message)
})

const internalServer = serve({ fetch: app.fetch, port: internalPort })
console.log(`HTTP endpoints on http://localhost:${internalPort} (internal)`)

const wsHttpServer = createServer((req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    const healthy = !isShuttingDown() && redisReady
    res.writeHead(healthy ? 200 : 503, { "Content-Type": "application/json" })
    res.end(
      JSON.stringify({
        status: healthy ? "ok" : "unhealthy",
        shuttingDown: isShuttingDown(),
        redisReady,
      }),
    )
    return
  }
  res.writeHead(404)
  res.end()
})

const wss = new WebSocketServer({ server: wsHttpServer })
wsHttpServer.listen(port)
console.log(`WebSocket endpoint: ws://localhost:${port}/connector/ws (public)`)

wss.on("connection", async (ws, req) => {
  const aliveWs = ws as AliveWebSocket
  aliveWs.isAlive = true
  aliveWs.connectedAt = Date.now()

  let firstMessage: RawData | null = null
  let connectorInfo: ConnectorInfo | null = null

  ws.on("message", (data) => {
    if (!connectorInfo) {
      if (!firstMessage) {
        firstMessage = data
      }
      return
    }
    processMessage(connectorInfo.id, ws, data)
  })

  ws.on("pong", () => {
    aliveWs.isAlive = true
    aliveWs.lastPongAt = Date.now()
    aliveWs.missedPongCount = 0
  })

  if (isShuttingDown()) {
    ws.close(1001, "Server shutting down")
    return
  }

  const url = new URL(req.url ?? "", `http://localhost:${port}`)

  if (url.pathname !== "/connector/ws") {
    ws.close(4000, "Invalid path")
    return
  }

  const token = url.searchParams.get("token")

  if (!token) {
    ws.close(4001, "Missing token")
    return
  }

  const info = await verifyConnectorToken(token)
  if (!info) {
    ws.close(4002, "Invalid token")
    return
  }

  console.log(`Connector connected: ${info.name} (${info.id})`)

  try {
    const registered = await coordinator.registerConnection(ws, info)
    if (!registered) return
  } catch (err) {
    console.error(`Failed to register connector ${info.id}:`, (err as Error).message)
    ws.close(4005, "Registration failed")
    return
  }

  connectorInfo = info
  aliveWs.connectorId = info.id
  aliveWs.connectorName = info.name

  if (firstMessage) {
    processMessage(info.id, ws, firstMessage)
    firstMessage = null
  }

  ws.on("close", (code, reason) => {
    const duration = aliveWs.connectedAt ? Math.round((Date.now() - aliveWs.connectedAt) / 1000) : 0
    const lastPong = aliveWs.lastPongAt ? Math.round((Date.now() - aliveWs.lastPongAt) / 1000) : -1
    console.log(
      `Connector disconnected: ${info.name} (${info.id}) code=${code} reason=${reason.toString()} duration=${duration}s lastPong=${lastPong}s ago`,
    )
    coordinator.unregisterConnection(info.id, ws)
  })

  ws.on("error", (err) => {
    console.error(`Connector error (${info.id}):`, err.message)
  })
})

coordinator.startHeartbeatInterval()

const WS_PING_INTERVAL_MS = 30000
const SHUTDOWN_GRACE_PERIOD_MS = 20000
const wsPingInterval = setInterval(() => {
  const clientCount = wss.clients.size
  if (clientCount > 0) {
    console.log(`[WS Ping] Checking ${clientCount} client(s)`)
  }
  wss.clients.forEach((ws) => {
    const aliveWs = ws as AliveWebSocket
    if (ws.readyState !== WebSocket.OPEN) {
      console.log(
        `[WS Ping] Skipping non-OPEN connection: ${aliveWs.connectorName || "unknown"} readyState=${ws.readyState}`,
      )
      return
    }
    if (!aliveWs.isAlive) {
      aliveWs.missedPongCount = (aliveWs.missedPongCount || 0) + 1
      if (aliveWs.missedPongCount >= 2) {
        const duration = aliveWs.connectedAt ? Math.round((Date.now() - aliveWs.connectedAt) / 1000) : 0
        const lastPong = aliveWs.lastPongAt ? Math.round((Date.now() - aliveWs.lastPongAt) / 1000) : -1
        console.log(
          `[WS Ping] Terminating unresponsive: ${aliveWs.connectorName || "unknown"} (${aliveWs.connectorId || "?"}) duration=${duration}s lastPong=${lastPong}s ago`,
        )
        return ws.terminate()
      }
      console.log(`[WS Ping] Missed pong (${aliveWs.missedPongCount}/2): ${aliveWs.connectorName || "unknown"}`)
    } else {
      aliveWs.missedPongCount = 0
    }
    aliveWs.isAlive = false
    ws.ping()
  })
}, WS_PING_INTERVAL_MS)

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`[Shutdown] Received ${signal}, starting graceful shutdown`)
  markShuttingDown()

  const shutdownNotice = {
    type: "shutdown_notice",
    correlationId: randomUUID(),
    payload: { gracePeriodMs: SHUTDOWN_GRACE_PERIOD_MS },
  }

  wss.clients.forEach((ws) => {
    try {
      ws.send(JSON.stringify(shutdownNotice))
    } catch {
      /* ignore */
    }
  })

  console.log(`[Shutdown] Sent shutdown notice to ${wss.clients.size} connectors`)

  await new Promise((resolve) => setTimeout(resolve, SHUTDOWN_GRACE_PERIOD_MS))

  console.log("[Shutdown] Grace period ended, draining and closing connections")
  await coordinator.startDrain()
  clearInterval(wsPingInterval)
  wss.close()
  wsHttpServer.close()
  internalServer.close()
  await shutdown()
  process.exit(0)
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
process.on("SIGINT", () => gracefulShutdown("SIGINT"))
