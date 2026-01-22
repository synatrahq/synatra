import ivm from "isolated-vm"
import { createResourceClient, type ResourceMapping, type UserConfigurableResourceType } from "./resource-client"
import { config } from "./config"

const executorConfig = config()
const POOL_SIZE = executorConfig.pool.size
const MEMORY_LIMIT_MB = executorConfig.pool.memoryLimitMb
const QUEUE_LIMIT = executorConfig.pool.queueLimit

export class QueueFullError extends Error {
  constructor() {
    super("Execution queue is full")
  }
}

interface ExecuteContext {
  resources?: ResourceMapping[]
}

interface ExecuteInput {
  organizationId: string
  code: string
  params: Record<string, unknown>
  paramAlias?: "payload" | "input"
  context: ExecuteContext
  environmentId: string
  timeout: number
}

interface ExecuteResult {
  value: unknown
  logs: unknown[][]
  duration: number
}

interface PooledIsolate {
  isolate: ivm.Isolate
  inUse: boolean
}

const isolates: PooledIsolate[] = []
const pendingQueue: Array<{
  input: ExecuteInput
  resolve: (result: ExecuteResult) => void
  reject: (error: Error) => void
}> = []

function initialize(): void {
  for (let i = 0; i < POOL_SIZE; i++) {
    isolates.push({
      isolate: new ivm.Isolate({ memoryLimit: MEMORY_LIMIT_MB }),
      inUse: false,
    })
  }
  console.log(
    `[ExecutionPool] Initialized ${POOL_SIZE} isolates with ${MEMORY_LIMIT_MB}MB memory limit each, queue limit ${QUEUE_LIMIT}`,
  )
}

// Initialize on module load
initialize()

export async function execute(input: ExecuteInput): Promise<ExecuteResult> {
  const pooled = isolates.find((i) => !i.inUse)

  if (pooled) {
    return runInIsolate(pooled, input)
  }

  if (pendingQueue.length >= QUEUE_LIMIT) {
    throw new QueueFullError()
  }

  return new Promise((resolve, reject) => {
    pendingQueue.push({ input, resolve, reject })
  })
}

async function runInIsolate(pooled: PooledIsolate, input: ExecuteInput): Promise<ExecuteResult> {
  pooled.inUse = true
  const start = Date.now()
  const logs: unknown[][] = []
  let context: ivm.Context | null = null

  try {
    context = await pooled.isolate.createContext()
    const jail = context.global

    // Set up global reference
    await jail.set("global", jail.derefInto())

    // Set up console.log
    await jail.set(
      "_log",
      new ivm.Callback((...args: unknown[]) => {
        logs.push(args)
      }),
    )

    // Set up resource client for database/API access
    const resources = input.context.resources ?? []
    const resourceClient = createResourceClient(input.organizationId, resources, input.environmentId)

    // Use a reference-based approach for async operations to avoid Promise cloning issues
    await jail.set(
      "_queryAsync",
      new ivm.Reference(async (resourceName: string, type: string, sql: string, params: string) => {
        try {
          const result = await resourceClient.query(resourceName, {
            type: type as UserConfigurableResourceType,
            sql,
            params: JSON.parse(params),
          })
          // Return plain string - primitives are automatically transferred
          return JSON.stringify(result)
        } catch (error) {
          throw new Error(error instanceof Error ? error.message : String(error))
        }
      }),
    )

    await jail.set(
      "_stripeRequestAsync",
      new ivm.Reference(async (resourceName: string, method: string, path: string, body: string) => {
        try {
          const result = await resourceClient.query(resourceName, {
            type: "stripe",
            method,
            path,
            body: body ? JSON.parse(body) : undefined,
          })
          // Return plain string - primitives are automatically transferred
          return JSON.stringify(result)
        } catch (error) {
          throw new Error(error instanceof Error ? error.message : String(error))
        }
      }),
    )

    await jail.set(
      "_githubRequestAsync",
      new ivm.Reference(async (resourceName: string, method: string, endpoint: string, body: string) => {
        try {
          const result = await resourceClient.query(resourceName, {
            type: "github",
            method,
            endpoint,
            body: body ? JSON.parse(body) : undefined,
          })
          return JSON.stringify(result)
        } catch (error) {
          throw new Error(error instanceof Error ? error.message : String(error))
        }
      }),
    )

    await jail.set(
      "_intercomRequestAsync",
      new ivm.Reference(async (resourceName: string, method: string, endpoint: string, body: string) => {
        try {
          const result = await resourceClient.query(resourceName, {
            type: "intercom",
            method,
            endpoint,
            body: body ? JSON.parse(body) : undefined,
          })
          return JSON.stringify(result)
        } catch (error) {
          throw new Error(error instanceof Error ? error.message : String(error))
        }
      }),
    )

    await jail.set(
      "_restapiRequestAsync",
      new ivm.Reference(
        async (
          resourceName: string,
          method: string,
          path: string,
          headers: string,
          queryParams: string,
          body: string,
        ) => {
          try {
            const result = await resourceClient.query(resourceName, {
              type: "restapi",
              method,
              path,
              headers: headers ? JSON.parse(headers) : undefined,
              queryParams: queryParams ? JSON.parse(queryParams) : undefined,
              body: body ? JSON.parse(body) : undefined,
            })
            return JSON.stringify(result)
          } catch (error) {
            throw new Error(error instanceof Error ? error.message : String(error))
          }
        },
      ),
    )

    // Inject params and context
    await jail.set("_params", new ivm.ExternalCopy(input.params).copyInto())
    await jail.set("_context", new ivm.ExternalCopy(input.context).copyInto())

    const aliasMap = { payload: "const payload = params;", input: "const input = params;" }
    const aliasDecl = input.paramAlias ? aliasMap[input.paramAlias] : ""

    // Build the execution script with typed resource accessors
    const script = await pooled.isolate.compileScript(`
      (async () => {
        const console = { log: (...args) => _log(...args) };

        // Expose params and context
        const params = _params;
        ${aliasDecl}
        const context = _context;

        // Build resource accessors based on their types
        const _buildResourceAccessor = (resource) => {
          const { name, type } = resource;
          if (type === "postgres" || type === "mysql") {
            return {
              query: async (sql, queryParams = []) => {
                const result = await _queryAsync.apply(null, [name, type, sql, JSON.stringify(queryParams)], {
                  arguments: { copy: true },
                  result: { promise: true, copy: true }
                });
                return JSON.parse(result);
              }
            };
          }
          if (type === "stripe") {
            return {
              request: async (method, path, body) => {
                const result = await _stripeRequestAsync.apply(null, [name, method, path, body ? JSON.stringify(body) : ""], {
                  arguments: { copy: true },
                  result: { promise: true, copy: true }
                });
                return JSON.parse(result);
              }
            };
          }
          if (type === "github") {
            return {
              request: async (method, endpoint, body) => {
                const result = await _githubRequestAsync.apply(null, [name, method, endpoint, body ? JSON.stringify(body) : ""], {
                  arguments: { copy: true },
                  result: { promise: true, copy: true }
                });
                return JSON.parse(result);
              }
            };
          }
          if (type === "intercom") {
            return {
              request: async (method, endpoint, body) => {
                const result = await _intercomRequestAsync.apply(null, [name, method, endpoint, body ? JSON.stringify(body) : ""], {
                  arguments: { copy: true },
                  result: { promise: true, copy: true }
                });
                return JSON.parse(result);
              }
            };
          }
          if (type === "restapi") {
            return {
              request: async (method, path, options = {}) => {
                const { headers, queryParams, body } = options;
                const result = await _restapiRequestAsync.apply(null, [
                  name,
                  method,
                  path,
                  headers ? JSON.stringify(headers) : "",
                  queryParams ? JSON.stringify(queryParams) : "",
                  body ? JSON.stringify(body) : ""
                ], {
                  arguments: { copy: true },
                  result: { promise: true, copy: true }
                });
                return JSON.parse(result);
              }
            };
          }
          return {};
        };

        // Build context.resources with named accessors (e.g., context.resources.db, context.resources.stripe)
        const _rawResources = context.resources ?? [];
        context.resources = {};
        for (const resource of _rawResources) {
          context.resources[resource.name] = _buildResourceAccessor(resource);
        }

        const _sanitize = (value) => {
          if (value === undefined) return null;
          return JSON.parse(
            JSON.stringify(value, (_, v) => {
              if (typeof v === "bigint") return v.toString();
              if (v instanceof Date) return v.toISOString();
              if (v instanceof Uint8Array || (typeof Buffer !== "undefined" && Buffer.isBuffer?.(v))) {
                return Buffer.from(v).toString("base64");
              }
              if (v instanceof Map) return Array.from(v.entries());
              if (v instanceof Set) return Array.from(v.values());
              return v;
            }),
          );
        };

        const _runner = async () => {
          ${input.code}
        };

        const _rawResult = await _runner();
        const _sanitized = _sanitize(_rawResult);
        return JSON.stringify(_sanitized ?? null);
      })()
    `)

    // Use promise: true to properly handle the async IIFE result
    const result = await script.run(context, { timeout: input.timeout, promise: true })

    return {
      value: JSON.parse(result),
      logs,
      duration: Date.now() - start,
    }
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error))
  } finally {
    // Release the context to prevent state leakage
    if (context) {
      context.release()
    }
    pooled.inUse = false

    // Check for pending work
    if (pendingQueue.length > 0) {
      const next = pendingQueue.shift()!
      runInIsolate(pooled, next.input).then(next.resolve).catch(next.reject)
    }
  }
}

export function stats(): { total: number; available: number; pending: number } {
  return {
    total: isolates.length,
    available: isolates.filter((i) => !i.inUse).length,
    pending: pendingQueue.length,
  }
}

export async function shutdown(): Promise<void> {
  // Reject all pending requests
  for (const pending of pendingQueue) {
    pending.reject(new Error("Executor shutting down"))
  }
  pendingQueue.length = 0

  // Dispose all isolates
  for (const pooled of isolates) {
    pooled.isolate.dispose()
  }
  isolates.length = 0
  console.log("[ExecutionPool] Shutdown complete")
}
