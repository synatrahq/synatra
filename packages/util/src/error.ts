import { z, ZodError } from "zod"

const ZodIssueSchema: z.ZodType<{
  code: string
  path: (string | number)[]
  message: string
  expected?: string
  received?: string
  keys?: string[]
  unionErrors?: unknown[]
  validation?: string
  inclusive?: boolean
  exact?: boolean
  minimum?: number | bigint
  maximum?: number | bigint
}> = z.object({
  code: z.string(),
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
  expected: z.string().optional(),
  received: z.string().optional(),
  keys: z.array(z.string()).optional(),
  unionErrors: z.lazy(() => z.array(ZodIssueSchema)).optional(),
  validation: z.string().optional(),
  inclusive: z.boolean().optional(),
  exact: z.boolean().optional(),
  minimum: z.union([z.number(), z.bigint()]).optional(),
  maximum: z.union([z.number(), z.bigint()]).optional(),
})

const defs = {
  NotFoundError: {
    status: 404,
    title: "Not found",
    schema: z.object({ type: z.string(), id: z.string().optional() }),
  },
  BadRequestError: {
    status: 400,
    title: "Bad request",
    schema: z.object({ message: z.string() }),
  },
  ForbiddenError: {
    status: 403,
    title: "Forbidden",
    schema: z.object({ message: z.string() }),
  },
  UnauthorizedError: {
    status: 401,
    title: "Unauthorized",
    schema: z.object({ message: z.string() }),
  },
  ConflictError: {
    status: 409,
    title: "Conflict",
    schema: z.object({ message: z.string() }),
  },
  InternalError: {
    status: 500,
    title: "Internal error",
    schema: z.object({ message: z.string() }),
  },
  TimeoutError: {
    status: 504,
    title: "Timeout",
    schema: z.object({ message: z.string() }),
  },
  ServiceUnavailableError: {
    status: 503,
    title: "Service unavailable",
    schema: z.object({ message: z.string() }),
  },
  MissingPrincipalError: {
    status: 401,
    title: "Missing principal",
    schema: z.object({ message: z.string() }),
  },
  PrincipalKindMismatchError: {
    status: 403,
    title: "Principal kind mismatch",
    schema: z.object({ expected: z.string(), actual: z.string() }),
  },
  PrincipalPropertyError: {
    status: 400,
    title: "Principal property error",
    schema: z.object({ property: z.string(), principalKind: z.string() }),
  },
  ResourceLimitError: {
    status: 429,
    title: "Resource limit exceeded",
    schema: z.object({
      resource: z.string(),
      limit: z.number(),
      plan: z.string(),
    }),
  },
  ValidationError: {
    status: 400,
    title: "Validation error",
    schema: z.object({ issues: z.array(ZodIssueSchema) }),
  },
  UnknownError: {
    status: 500,
    title: "Unknown error",
    schema: z.object({ message: z.string() }),
  },
} as const

const brand = Symbol.for("synatra.app-error")

export type ErrorName = keyof typeof defs

export type ErrorData<Name extends ErrorName> = z.infer<(typeof defs)[Name]["schema"]>

export type ErrorInput<Name extends ErrorName> = z.input<(typeof defs)[Name]["schema"]>

export type ErrorPayload = {
  [Name in ErrorName]: { name: Name; data: ErrorData<Name> }
}[ErrorName]

export type ProblemDetails<Name extends ErrorName = ErrorName> = {
  type: string
  title: string
  status: number
  detail?: string
  instance?: string
  name: Name
  data: ErrorData<Name>
} & Record<string, unknown>

export type CreateOptions = {
  cause?: unknown
  message?: string
  strict?: boolean
}

export type ProblemOptions = {
  status?: number
  type?: string
  title?: string
  detail?: string
  instance?: string
  extensions?: Record<string, unknown>
}

export class AppError<Name extends ErrorName = ErrorName> extends Error {
  readonly [brand] = true
  readonly name: Name
  readonly data: ErrorData<Name>
  readonly status?: number
  readonly type: string
  readonly title: string

  constructor(name: Name, data: ErrorData<Name>, options?: CreateOptions) {
    const def = defs[name]
    const message = options?.message ?? def.title
    super(message, { cause: options?.cause })
    this.name = name
    this.data = data
    this.status = def.status
    this.type = `urn:synatra:error:${name}`
    this.title = def.title
  }

  toObject(): { name: Name; data: ErrorData<Name> } {
    return { name: this.name, data: this.data }
  }

  toProblemDetails(options?: ProblemOptions): ProblemDetails<Name> {
    const status = options?.status ?? this.status ?? 500
    const type = options?.type ?? this.type
    const title = options?.title ?? this.title
    const base: ProblemDetails<Name> = {
      type,
      title,
      status,
      name: this.name,
      data: this.data,
    }
    if (options?.detail) {
      base.detail = options.detail
    }
    if (options?.instance) {
      base.instance = options.instance
    }
    if (options?.extensions) {
      return { ...base, ...options.extensions }
    }
    return base
  }
}

export const createError = <Name extends ErrorName>(
  name: Name,
  data: ErrorInput<Name>,
  options?: CreateOptions,
): AppError<Name> => {
  const schema = defs[name].schema
  const parsed = options?.strict ? (schema.parse(data) as ErrorData<Name>) : (data as ErrorData<Name>)
  return new AppError(name, parsed, options)
}

export const isAppError = (input: unknown): input is AppError => {
  if (!input || typeof input !== "object") return false
  return brand in input
}

export const isProblemDetails = (input: unknown): input is ProblemDetails => {
  if (!input || typeof input !== "object") return false
  const value = input as Record<string, unknown>
  if (typeof value.type !== "string") return false
  if (typeof value.title !== "string") return false
  if (typeof value.status !== "number") return false
  if (typeof value.name !== "string") return false
  if (!("data" in value)) return false
  return true
}

export const fromUnknown = (input: unknown): AppError => {
  if (isAppError(input)) return input
  if (input instanceof ZodError) {
    return createError("ValidationError", { issues: input.issues }, { cause: input, strict: true })
  }
  if (input instanceof Error) {
    const message = input.message || "Unknown error"
    return createError("UnknownError", { message }, { cause: input })
  }
  const message = typeof input === "string" ? input : "Unknown error"
  return createError("UnknownError", { message }, { cause: input })
}

export const toErrorMessage = (input: unknown): string => {
  if (isProblemDetails(input)) return extractErrorMessage(input)
  if (input instanceof Error) return input.message || "Unknown error"
  if (input && typeof input === "object") {
    const value = input as Record<string, unknown>
    if (typeof value.message === "string") return value.message
    if (typeof value.error === "string") return value.error
  }
  if (typeof input === "string") return input
  return "Unknown error"
}

export const extractErrorMessage = (problem: ProblemDetails): string => {
  if (!problem.data || typeof problem.data !== "object") return problem.title
  const data = problem.data as Record<string, unknown>
  if (typeof data.message === "string") return data.message
  if (problem.name === "NotFoundError" && typeof data.type === "string") {
    return data.id ? `${data.type} "${data.id}" not found` : `${data.type} not found`
  }
  if (problem.name === "ResourceLimitError") {
    const d = data as { resource: string; limit: number; plan: string }
    return `${d.resource} limit (${d.limit}) exceeded on ${d.plan} plan`
  }
  return problem.title
}
