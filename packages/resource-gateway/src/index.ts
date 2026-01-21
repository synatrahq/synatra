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
  ws.on("pong", () => {
    aliveWs.isAlive = true
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

  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString()) as ConnectorMessage
    coordinator.handleMessage(info.id, msg).catch((err) => {
      console.error(`Error handling message from ${info.id}:`, err.message)
    })
  })

  ws.on("close", () => {
    console.log(`Connector disconnected: ${info.name} (${info.id})`)
    coordinator.unregisterConnection(info.id, ws)
  })

  ws.on("error", (err) => {
    console.error(`Connector error (${info.id}):`, err.message)
  })
})

coordinator.startHeartbeatInterval()

const WS_PING_INTERVAL_MS = 30000
const wsPingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    const aliveWs = ws as AliveWebSocket
    if (ws.readyState !== WebSocket.OPEN) {
      return
    }
    if (!aliveWs.isAlive) {
      console.log("Terminating unresponsive WebSocket connection")
      return ws.terminate()
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
