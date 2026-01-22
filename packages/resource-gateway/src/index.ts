import { createServer } from "http"
import { serve } from "@hono/node-server"
import { WebSocketServer, WebSocket } from "ws"
import { initEncryption } from "@synatra/util/crypto"
import { app } from "./server"
import * as coordinator from "./coordinator"
import { verifyConnectorToken } from "./connector-auth"
import type { ConnectorMessage } from "./ws-types"
import { config } from "./config"
import { shutdown, isShuttingDown } from "./shutdown"
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

const gatewayConfig = config()
initEncryption(gatewayConfig.encryptionKey)

const port = gatewayConfig.port
const internalPort = gatewayConfig.internalPort

async function initializeRedis(): Promise<void> {
  if (!isRedisEnabled()) {
    console.log("[Redis] Mode: off (single instance)")
    return
  }

  console.log(`[Redis] Mode: redis, Instance ID: ${gatewayConfig.instanceId}`)
  await startReplyConsumer()
  console.log("[Redis] Reply consumer started")
}

initializeRedis().catch((err) => {
  console.error("[Redis] Failed to initialize:", err.message)
})

const internalServer = serve({ fetch: app.fetch, port: internalPort })
console.log(`HTTP endpoints on http://localhost:${internalPort} (internal)`)

const wsHttpServer = createServer((req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ status: "ok" }))
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
  let registered = false
  try {
    registered = await coordinator.registerConnection(ws, info)
  } catch (err) {
    console.error(`Failed to register connector ${info.id}:`, (err as Error).message)
    ws.close(4005, "Registration failed")
    return
  }
  if (!registered) {
    return
  }
  aliveWs.connectorId = info.id
  aliveWs.connectorName = info.name

  ws.on("message", (data) => {
    let msg: ConnectorMessage
    try {
      msg = JSON.parse(data.toString()) as ConnectorMessage
    } catch (err) {
      console.error(`Invalid JSON from ${info.id}:`, (err as Error).message)
      return
    }
    coordinator.handleMessage(info.id, msg).catch((err) => {
      console.error(`Error handling message from ${info.id}:`, err.message)
    })
  })

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

process.on("SIGTERM", async () => {
  console.log("Received SIGTERM")
  clearInterval(wsPingInterval)
  wss.close()
  wsHttpServer.close()
  internalServer.close()
  await shutdown()
  process.exit(0)
})

process.on("SIGINT", async () => {
  console.log("Received SIGINT")
  clearInterval(wsPingInterval)
  wss.close()
  wsHttpServer.close()
  internalServer.close()
  await shutdown()
  process.exit(0)
})
