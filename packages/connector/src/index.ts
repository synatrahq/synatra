import { connect, disconnect, isConnected } from "./connection"
import * as pool from "./pool"
import { config } from "./config"

const connectorConfig = config()
const GATEWAY_URL = connectorConfig.gatewayUrl
const TOKEN = connectorConfig.connectorToken
const VERSION = connectorConfig.version
const PLATFORM = connectorConfig.platform

console.log(`synatra-connector v${VERSION}`)
console.log(`Platform: ${PLATFORM}`)
console.log(`Connecting to: ${GATEWAY_URL}`)

connect({
  gatewayUrl: GATEWAY_URL,
  token: TOKEN,
  version: VERSION,
  platform: PLATFORM,
})

process.on("SIGINT", async () => {
  console.log("Shutting down...")
  disconnect()
  await pool.invalidateAll()
  process.exit(0)
})

process.on("SIGTERM", async () => {
  console.log("Shutting down...")
  disconnect()
  await pool.invalidateAll()
  process.exit(0)
})

setInterval(() => {
  const status = isConnected() ? "connected" : "disconnected"
  const pools = pool.stats()
  console.log(`Status: ${status}, Pools: pg=${pools.postgres}, mysql=${pools.mysql}`)
}, 60000)
