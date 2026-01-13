import { readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  fetchSpec,
  parseEndpoints,
  parseAllEndpoints,
  splitEndpoints,
  type EndpointDoc,
  type EndpointIndex,
  type EndpointDetails,
} from "./openapi-parser"
import { generateIndexJson, generateDetailsJson, generateApiDocsModule } from "./code-generator"

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = resolve(__dirname, "api-docs-config.json")
const OUTPUT_DIR = resolve(__dirname, "../src/routes/agents/copilot/api-docs")

type EndpointConfig = { path: string; method: string }

type ServiceConfig = {
  specUrl: string
  format?: "json" | "yaml"
  endpoints: "all" | EndpointConfig[]
}

type Config = Record<string, ServiceConfig>

async function loadConfig(): Promise<Config> {
  const content = await readFile(CONFIG_PATH, "utf-8")
  return JSON.parse(content)
}

async function fetchWithRetry(
  url: string,
  format: "json" | "yaml",
  retries = 3,
): Promise<Awaited<ReturnType<typeof fetchSpec>>> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetchSpec(url, format)
    } catch (err) {
      console.warn(`Attempt ${i + 1}/${retries} failed for ${url}:`, err instanceof Error ? err.message : err)
      if (i === retries - 1) throw err
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)))
    }
  }
  throw new Error("Unreachable")
}

async function processService(name: string, config: ServiceConfig): Promise<EndpointDoc[]> {
  console.log(`Fetching ${name} spec from ${config.specUrl}...`)
  const spec = await fetchWithRetry(config.specUrl, config.format || "json")

  let endpoints: EndpointDoc[]
  if (config.endpoints === "all") {
    console.log(`Parsing all endpoints for ${name}...`)
    endpoints = parseAllEndpoints(spec)
  } else {
    console.log(`Parsing ${config.endpoints.length} endpoints for ${name}...`)
    endpoints = parseEndpoints(spec, config.endpoints)
  }

  console.log(`Parsed ${endpoints.length} endpoints for ${name}`)
  return endpoints
}

async function main() {
  console.log("Loading configuration...")
  const config = await loadConfig()

  const services = Object.keys(config)
  console.log(`Processing ${services.length} services: ${services.join(", ")}`)

  const allIndex: Record<string, EndpointIndex[]> = {}
  const allDetails: Record<string, EndpointDetails[]> = {}

  for (const name of services) {
    try {
      const endpoints = await processService(name, config[name])
      const { index, details } = splitEndpoints(endpoints)
      allIndex[name] = index
      allDetails[name] = details
    } catch (err) {
      console.error(`Failed to process ${name}:`, err instanceof Error ? err.message : err)
      throw err
    }
  }

  console.log("Generating files...")

  const indexJson = generateIndexJson(allIndex)
  const detailsJson = generateDetailsJson(allDetails)
  const moduleCode = generateApiDocsModule()

  const indexPath = resolve(OUTPUT_DIR, "api-docs-index.json")
  const detailsPath = resolve(OUTPUT_DIR, "api-docs-details.json")
  const modulePath = resolve(OUTPUT_DIR, "api-docs.ts")

  await writeFile(indexPath, indexJson)
  console.log(`Written: ${indexPath}`)

  await writeFile(detailsPath, detailsJson)
  console.log(`Written: ${detailsPath}`)

  await writeFile(modulePath, moduleCode)
  console.log(`Written: ${modulePath}`)

  const totalEndpoints = Object.values(allIndex).reduce((sum, idx) => sum + idx.length, 0)
  console.log(`\nDone! Generated ${totalEndpoints} endpoints across ${services.length} services.`)

  for (const [name, idx] of Object.entries(allIndex)) {
    console.log(`  ${name}: ${idx.length} endpoints`)
  }
}

main().catch((err) => {
  console.error("Failed to generate API docs:", err)
  process.exit(1)
})
