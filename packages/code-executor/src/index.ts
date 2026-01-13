import { serve } from "@hono/node-server"
import { app } from "./server"
import * as pool from "./pool"
import { config } from "./config"

const executorConfig = config()
const port = executorConfig.port

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("Received SIGTERM, shutting down...")
  await pool.shutdown()
  process.exit(0)
})

process.on("SIGINT", async () => {
  console.log("Received SIGINT, shutting down...")
  await pool.shutdown()
  process.exit(0)
})

console.log(`Code Executor running on http://localhost:${port}`)
serve({ fetch: app.fetch, port })
