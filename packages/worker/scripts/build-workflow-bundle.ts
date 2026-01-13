/**
 * Pre-builds workflow bundle for production deployment.
 *
 * This improves worker startup time by bundling workflows ahead of time
 * instead of bundling on every worker start.
 *
 * @see https://docs.temporal.io/develop/typescript/core-application#pre-built-workflow-bundles
 */
import { bundleWorkflowCode } from "@temporalio/worker"
import { writeFile, mkdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const BUNDLE_PATH = resolve(__dirname, "../dist/workflow-bundle.js")

async function main() {
  console.log("Building workflow bundle...")

  const { code } = await bundleWorkflowCode({
    workflowsPath: resolve(__dirname, "../../workflows/src/index.ts"),
  })

  await mkdir(dirname(BUNDLE_PATH), { recursive: true })
  await writeFile(BUNDLE_PATH, code)

  console.log(`Workflow bundle written to: ${BUNDLE_PATH}`)
}

main().catch((err) => {
  console.error("Failed to build workflow bundle:", err)
  process.exit(1)
})
