import { generateText } from "ai"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createAnthropic } from "@ai-sdk/anthropic"
import Fuse from "fuse.js"
import {
  API_INDEX,
  API_DETAILS,
  formatDetailsForLLM,
  type EndpointIndex,
  type EndpointDetails,
} from "./api-docs/api-docs"
import commonEndpoints from "./api-docs/common-endpoints.json"
import { getProductionConfig } from "./models"
import { config } from "../../../config"

const LOG_PREFIX = "[Copilot:ApiSearch]"
const DEBUG = config().app.isDevelopment

function debugLog(message: string, data?: Record<string, unknown>) {
  if (!DEBUG) return
  if (data) {
    console.log(message, data)
  } else {
    console.log(message)
  }
}

type SearchModelResult = {
  model: ReturnType<ReturnType<typeof createGoogleGenerativeAI | typeof createOpenAI | typeof createAnthropic>>
  name: string
}

async function getSearchModel(): Promise<SearchModelResult> {
  const cfgs = await getProductionConfig()

  if (cfgs.google) {
    return {
      model: createGoogleGenerativeAI({ apiKey: cfgs.google.apiKey, baseURL: cfgs.google.baseUrl })(
        "gemini-2.0-flash-lite",
      ),
      name: "gemini-2.0-flash-lite",
    }
  }
  if (cfgs.openai) {
    return {
      model: createOpenAI({ apiKey: cfgs.openai.apiKey, baseURL: cfgs.openai.baseUrl })("gpt-4o-mini"),
      name: "gpt-4o-mini",
    }
  }
  if (cfgs.anthropic) {
    return {
      model: createAnthropic({ apiKey: cfgs.anthropic.apiKey, baseURL: cfgs.anthropic.baseUrl })(
        "claude-3-5-haiku-latest",
      ),
      name: "claude-3-5-haiku-latest",
    }
  }

  throw new Error("No LLM provider configured. Configure API keys in the Synatra AI resource.")
}

const PREFILTER_LIMIT = 50
const CACHE_TTL_MS = 5 * 60 * 1000
const CACHE_MAX_SIZE = 100

type CacheEntry = { results: EndpointDetails[]; timestamp: number }
const searchCache = new Map<string, CacheEntry>()

function pruneCache() {
  if (searchCache.size <= CACHE_MAX_SIZE) return

  const now = Date.now()
  const entries = Array.from(searchCache.entries())
  entries.sort((a, b) => a[1].timestamp - b[1].timestamp)

  for (const [key, entry] of entries) {
    if (searchCache.size <= CACHE_MAX_SIZE / 2) break
    if (now - entry.timestamp > CACHE_TTL_MS) {
      searchCache.delete(key)
    }
  }

  if (searchCache.size > CACHE_MAX_SIZE) {
    const toDelete = entries.slice(0, searchCache.size - CACHE_MAX_SIZE / 2)
    for (const [key] of toDelete) {
      searchCache.delete(key)
    }
  }
}

const fuseIndexes = new Map<string, Fuse<EndpointIndex>>()

function getFuseIndex(apiType: string): Fuse<EndpointIndex> | null {
  if (fuseIndexes.has(apiType)) return fuseIndexes.get(apiType)!

  const index = API_INDEX[apiType]
  if (!index || index.length === 0) return null

  const fuse = new Fuse(index, {
    keys: ["path", "description", "method"],
    threshold: 0.4,
    includeScore: true,
  })
  fuseIndexes.set(apiType, fuse)
  return fuse
}

type FuseResultWithScore = { item: EndpointIndex; score: number }

function prefilterEndpoints(apiType: string, query: string): FuseResultWithScore[] {
  const fuse = getFuseIndex(apiType)
  if (!fuse) return []

  const results = fuse.search(query)
  return results.slice(0, PREFILTER_LIMIT).map((r) => ({ item: r.item, score: r.score ?? 0 }))
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function formatCandidatesAsXML(candidates: EndpointIndex[]): string {
  const items = candidates.map(
    (e, i) =>
      `  <endpoint id="${i + 1}">
    <method>${escapeXml(e.method)}</method>
    <path>${escapeXml(e.path)}</path>
    <description>${escapeXml(e.description)}</description>
  </endpoint>`,
  )
  return `<endpoints>\n${items.join("\n")}\n</endpoints>`
}

function parseEndpointNumbers(text: string, maxIndex: number): number[] {
  const match = text.match(/\[[\d,\s]*\]/)
  if (!match) return []

  try {
    const nums: unknown = JSON.parse(match[0])
    if (!Array.isArray(nums)) return []

    return nums
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 1 && n <= maxIndex)
      .filter((n, i, arr) => arr.indexOf(n) === i)
      .slice(0, 5)
  } catch {
    return []
  }
}

export async function searchEndpointsWithLLM(
  apiType: string,
  query: string,
  userIntent?: string,
): Promise<EndpointDetails[]> {
  const startTime = Date.now()
  const totalEndpoints = API_INDEX[apiType]?.length ?? 0

  debugLog(`${LOG_PREFIX} Search started`, {
    apiType,
    query,
    userIntent: userIntent?.slice(0, 100),
    totalEndpoints,
  })

  const cacheKey = `${apiType}:${query.toLowerCase().trim()}`
  const cached = searchCache.get(cacheKey)
  const now = Date.now()
  if (cached) {
    if (now - cached.timestamp < CACHE_TTL_MS) {
      debugLog(`${LOG_PREFIX} Cache HIT`, {
        apiType,
        query,
        resultCount: cached.results.length,
        results: cached.results.map((r) => `${r.method} ${r.path}`),
        cacheAge: `${Math.round((now - cached.timestamp) / 1000)}s`,
      })
      return cached.results
    }
    debugLog(`${LOG_PREFIX} Cache EXPIRED, deleting`, { apiType, query })
    searchCache.delete(cacheKey)
  } else {
    debugLog(`${LOG_PREFIX} Cache MISS`, { apiType, query })
  }

  const candidatesWithScore = prefilterEndpoints(apiType, query)
  const candidates = candidatesWithScore.map((c) => c.item)

  debugLog(`${LOG_PREFIX} Fuse.js prefilter completed`, {
    apiType,
    query,
    totalEndpoints,
    candidateCount: candidates.length,
    topCandidates: candidatesWithScore.slice(0, 10).map((c) => ({
      path: c.item.path,
      method: c.item.method,
      score: c.score.toFixed(3),
    })),
  })

  if (candidates.length === 0) {
    debugLog(`${LOG_PREFIX} No candidates found, returning empty`, { apiType, query })
    return []
  }

  const details = API_DETAILS[apiType] ?? []
  const index = API_INDEX[apiType] ?? []

  const candidateXML = formatCandidatesAsXML(candidates)
  const { model: searchModel, name: modelName } = await getSearchModel()

  debugLog(`${LOG_PREFIX} Sending to LLM`, {
    apiType,
    query,
    model: modelName,
    candidateCount: candidates.length,
    xmlLength: candidateXML.length,
  })

  let selectedNumbers: number[]
  let llmRawResponse: string | null = null
  const llmStartTime = Date.now()

  const intentSection = userIntent ? `User intent: "${userIntent.slice(0, 500)}"\n\n` : ""

  try {
    const { text } = await generateText({
      model: searchModel,
      temperature: 0,
      maxOutputTokens: 200,
      prompt: `You are an API endpoint selector. Select the 5 most relevant endpoints for the user's goal.

${intentSection}${candidateXML}

Search query: "${query}"

Output ONLY a JSON array of endpoint IDs (1-indexed). Example: [1, 3, 5, 8, 12]
If none match, output: []`,
    })

    llmRawResponse = text
    selectedNumbers = parseEndpointNumbers(text, candidates.length)

    debugLog(`${LOG_PREFIX} LLM response received`, {
      apiType,
      query,
      model: modelName,
      llmDuration: `${Date.now() - llmStartTime}ms`,
      rawResponse: text,
      parsedNumbers: selectedNumbers,
      parseSuccess: selectedNumbers.length > 0,
    })
  } catch (err) {
    console.error(`${LOG_PREFIX} LLM request failed`, {
      apiType,
      query,
      model: modelName,
      error: err instanceof Error ? err.message : String(err),
      llmDuration: `${Date.now() - llmStartTime}ms`,
    })
    selectedNumbers = []
  }

  let results: EndpointDetails[]
  let selectionMethod: string

  if (selectedNumbers.length > 0) {
    selectionMethod = "llm"
    results = selectedNumbers
      .map((num) => {
        const candidate = candidates[num - 1]
        const detailIdx = index.findIndex((e) => e.method === candidate.method && e.path === candidate.path)
        return detailIdx >= 0 ? details[detailIdx] : null
      })
      .filter((d): d is EndpointDetails => d !== null)
  } else {
    selectionMethod = "fallback"
    results = candidates
      .slice(0, 5)
      .map((candidate) => {
        const detailIdx = index.findIndex((e) => e.method === candidate.method && e.path === candidate.path)
        return detailIdx >= 0 ? details[detailIdx] : null
      })
      .filter((d): d is EndpointDetails => d !== null)
  }

  searchCache.set(cacheKey, { results, timestamp: now })
  pruneCache()

  debugLog(`${LOG_PREFIX} Search completed`, {
    apiType,
    query,
    selectionMethod,
    totalDuration: `${Date.now() - startTime}ms`,
    resultCount: results.length,
    cacheSize: searchCache.size,
  })

  debugLog(`${LOG_PREFIX} Selected endpoints detail`, {
    apiType,
    query,
    endpoints: results.map((r) => ({
      method: r.method,
      path: r.path,
      pathParams: r.pathParams ? Object.keys(r.pathParams) : null,
      queryParams: r.queryParams ? Object.keys(r.queryParams) : null,
      bodyParams: r.bodyParams ? Object.keys(r.bodyParams) : null,
      responseExampleKeys:
        r.responseExample && typeof r.responseExample === "object"
          ? Object.keys(r.responseExample as Record<string, unknown>)
          : null,
    })),
  })

  return results
}

export function formatSearchResultsForLLM(results: EndpointDetails[]): string {
  if (results.length === 0) return "No matching endpoints found."
  return results.map(formatDetailsForLLM).join("\n\n---\n\n")
}

export function getApiSummary(apiType: string): string {
  const index = API_INDEX[apiType]
  if (!index || index.length === 0) return ""

  const commonPaths = (commonEndpoints as Record<string, string[]>)[apiType] ?? []

  let selected: EndpointIndex[]
  if (commonPaths.length > 0) {
    selected = index.filter((e) => commonPaths.some((p) => e.path === p || e.path.startsWith(p + "/")))
    if (selected.length > 10) selected = selected.slice(0, 10)
  } else {
    selected = index.slice(0, 10)
  }

  debugLog(`${LOG_PREFIX} getApiSummary`, {
    apiType,
    totalEndpoints: index.length,
    commonPathsCount: commonPaths.length,
    selectedCount: selected.length,
    selected: selected.map((e) => `${e.method} ${e.path}`),
  })

  const lines = selected.map((e) => `- ${e.method} ${e.path} - ${e.description}`)
  if (index.length > selected.length) {
    lines.push(`... and ${index.length - selected.length} more endpoints`)
  }
  lines.unshift(`${apiType} API (${index.length} endpoints):`)
  return lines.join("\n")
}
