import { NativeConnection, Worker, type WorkerOptions } from "@temporalio/worker"
import { createServer } from "node:http"
import { existsSync } from "node:fs"
import { initEncryption } from "@synatra/util/crypto"
import * as activities from "./activities"
import { config } from "./config"

const workerConfig = config()
initEncryption(workerConfig.encryptionKey)
const bundlePath = new URL("../dist/workflow-bundle.js", import.meta.url).pathname
const workflowsPath = new URL("../../workflows/src/index.ts", import.meta.url).pathname

let workerState: "starting" | "running" | "stopped" = "starting"

function startHealthServer(port: number): void {
  const server = createServer((req, res) => {
    if (req.url === "/health" && req.method === "GET") {
      const ok = workerState === "running"
      res.writeHead(ok ? 200 : 503, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ status: workerState }))
      return
    }
    res.writeHead(404)
    res.end()
  })
  server.listen(port, () => {
    console.log(`Health server running on http://localhost:${port}/health`)
  })
}

async function run(): Promise<void> {
  const healthPort = Number(process.env.HEALTH_PORT ?? "3000")
  startHealthServer(healthPort)

  const connection = await NativeConnection.connect({
    address: workerConfig.temporal.address,
    tls: workerConfig.temporal.apiKey ? true : undefined,
    apiKey: workerConfig.temporal.apiKey,
  })

  try {
    const isDev = process.env.NODE_ENV !== "production"
    const useBundle = !isDev && existsSync(bundlePath)
    const workflowOptions: Pick<WorkerOptions, "workflowBundle" | "workflowsPath"> = useBundle
      ? { workflowBundle: { codePath: bundlePath } }
      : { workflowsPath }

    const worker = await Worker.create({
      connection,
      namespace: workerConfig.temporal.namespace,
      taskQueue: workerConfig.temporal.taskQueue,
      ...workflowOptions,
      activities,
    })

    console.log(`Worker started on queue: ${workerConfig.temporal.taskQueue}`)
    console.log(`Connected to Temporal at: ${workerConfig.temporal.address}`)
    console.log(`Workflow bundle: ${useBundle ? "prebuilt" : "runtime"}`)

    workerState = "running"
    await worker.run()
  } finally {
    workerState = "stopped"
    await connection.close()
  }
}

run().catch((err) => {
  console.error("Worker failed:", err)
  process.exit(1)
})
