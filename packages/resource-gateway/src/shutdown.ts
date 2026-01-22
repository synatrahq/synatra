import { releaseAllOwnership } from "./ownership"
import { stopReplyConsumer, clearPendingCommands } from "./command-stream"
import { closeRedis } from "./redis-client"
import * as pool from "./pool"
import * as coordinator from "./coordinator"

let shuttingDown = false
let shutdownStarted = false

export async function shutdown(): Promise<void> {
  if (shutdownStarted) return
  shutdownStarted = true
  shuttingDown = true

  console.log("[Shutdown] Starting graceful shutdown...")

  console.log("[Shutdown] Stopping reply consumer...")
  stopReplyConsumer()

  console.log("[Shutdown] Clearing pending commands...")
  clearPendingCommands()
  coordinator.clearPendingRequests()

  console.log("[Shutdown] Closing all connections...")
  await coordinator.closeAllConnections()

  console.log("[Shutdown] Releasing connector ownership...")
  await releaseAllOwnership()

  console.log("[Shutdown] Closing all pools...")
  await pool.invalidateAll()

  console.log("[Shutdown] Closing Redis connection...")
  await closeRedis()

  console.log("[Shutdown] Graceful shutdown complete")
}

export function isShuttingDown(): boolean {
  return shuttingDown
}

export function markShuttingDown(): void {
  shuttingDown = true
}
