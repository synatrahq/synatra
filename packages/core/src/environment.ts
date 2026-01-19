import { z } from "zod"
import { eq, and, notInArray } from "drizzle-orm"
import { principal } from "./principal"
import { withDb, first } from "./database"
import { createError } from "@synatra/util/error"
import { generateSlug, generateRandomId, isReservedSlug } from "@synatra/util/identifier"
import { EnvironmentTable } from "./schema/environment.sql"
import { EnvironmentColorRegex, STAGING_ENV } from "./types"

export const CreateEnvironmentSchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  color: z.string().optional(),
  protected: z.boolean().optional(),
})

export const CreateManyEnvironmentsSchema = z.array(
  z.object({
    name: z.string().min(1),
    slug: z.string().optional(),
    color: z.string().optional(),
    protected: z.boolean().optional(),
    organizationId: z.string(),
    createdBy: z.string(),
    updatedBy: z.string().optional(),
  }),
)

export const UpdateEnvironmentSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  color: z.string().optional(),
})

export const FindEnvironmentBySlugSchema = z.object({
  slug: z.string(),
  organizationId: z.string().optional(),
})

export const FindNonProtectedEnvironmentsSchema = z.array(z.string())

export const DeleteNonProtectedEnvironmentsSchema = z.array(z.string())

const DEFAULT_COLOR = "#3B82F6"

function normalizeColor(color: string): string {
  const trimmed = color.trim()
  if (!trimmed) return ""
  const prefixed = trimmed.startsWith("#") ? trimmed : `#${trimmed}`
  if (!EnvironmentColorRegex.test(prefixed)) return ""
  return `#${prefixed.slice(1).toUpperCase()}`
}

function prepareValues(input: { name: string; slug?: string; color?: string; protected?: boolean }) {
  const slug = input.slug?.trim() || generateSlug(input.name) || generateRandomId()
  return {
    name: input.name,
    slug,
    color: input.color ? normalizeColor(input.color) : DEFAULT_COLOR,
    protected: input.protected ?? ["production", "staging"].includes(slug),
  }
}

export async function listEnvironments() {
  const organizationId = principal.orgId()
  return withDb((db) => db.select().from(EnvironmentTable).where(eq(EnvironmentTable.organizationId, organizationId)))
}

export async function findEnvironmentById(id: string) {
  const organizationId = principal.orgId()
  return withDb((db) =>
    db
      .select()
      .from(EnvironmentTable)
      .where(and(eq(EnvironmentTable.id, id), eq(EnvironmentTable.organizationId, organizationId)))
      .then(first),
  )
}

export async function getEnvironmentById(id: string) {
  const environment = await findEnvironmentById(id)
  if (!environment) throw createError("NotFoundError", { type: "Environment", id })
  return environment
}

export async function findEnvironmentBySlug(input: z.input<typeof FindEnvironmentBySlugSchema>) {
  const data = FindEnvironmentBySlugSchema.parse(input)
  const orgId = data.organizationId ?? principal.orgId()
  return withDb((db) =>
    db
      .select()
      .from(EnvironmentTable)
      .where(and(eq(EnvironmentTable.organizationId, orgId), eq(EnvironmentTable.slug, data.slug)))
      .then(first),
  )
}

export async function findProductionEnvironment(organizationId: string) {
  return withDb((db) =>
    db
      .select()
      .from(EnvironmentTable)
      .where(and(eq(EnvironmentTable.organizationId, organizationId), eq(EnvironmentTable.slug, "production")))
      .then(first),
  )
}

export async function createEnvironment(input: z.input<typeof CreateEnvironmentSchema>) {
  const data = CreateEnvironmentSchema.parse(input)
  const organizationId = principal.orgId()
  const userId = principal.actingUserId()

  const prepared = prepareValues(data)
  if (isReservedSlug(prepared.slug)) {
    throw createError("BadRequestError", { message: `Slug "${prepared.slug}" is reserved` })
  }
  try {
    const [environment] = await withDb((db) =>
      db
        .insert(EnvironmentTable)
        .values({ ...prepared, organizationId, createdBy: userId, updatedBy: userId })
        .returning(),
    )
    return environment
  } catch (err) {
    if (err instanceof Error && err.message.includes("environment_org_slug_idx")) {
      throw createError("ConflictError", { message: `Environment with slug "${prepared.slug}" already exists` })
    }
    throw err
  }
}

export async function createManyEnvironments(input: z.input<typeof CreateManyEnvironmentsSchema>) {
  const data = CreateManyEnvironmentsSchema.parse(input)
  if (data.length === 0) return []

  const values = data.map((input) => ({
    ...prepareValues(input),
    organizationId: input.organizationId,
    createdBy: input.createdBy,
    updatedBy: input.updatedBy ?? input.createdBy,
  }))

  for (const v of values) {
    if (isReservedSlug(v.slug)) {
      throw createError("BadRequestError", { message: `Slug "${v.slug}" is reserved` })
    }
  }

  return withDb((db) => db.insert(EnvironmentTable).values(values).returning())
}

export async function updateEnvironment(input: z.input<typeof UpdateEnvironmentSchema>) {
  const data = UpdateEnvironmentSchema.parse(input)
  if (data.slug !== undefined && isReservedSlug(data.slug)) {
    throw createError("BadRequestError", { message: `Slug "${data.slug}" is reserved` })
  }
  const existing = await getEnvironmentById(data.id)

  if (data.slug !== undefined && existing.protected && data.slug !== existing.slug) {
    throw createError("BadRequestError", { message: "Protected environments cannot change slug" })
  }

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
    updatedBy: principal.actingUserId(),
  }

  if (data.name !== undefined) updateData.name = data.name
  if (data.slug !== undefined) updateData.slug = data.slug
  if (data.color !== undefined) {
    const normalizedColor = normalizeColor(data.color)
    if (normalizedColor) updateData.color = normalizedColor
  }

  try {
    const [environment] = await withDb((db) =>
      db.update(EnvironmentTable).set(updateData).where(eq(EnvironmentTable.id, data.id)).returning(),
    )
    return environment
  } catch (err) {
    if (err instanceof Error && err.message.includes("environment_org_slug_idx")) {
      throw createError("ConflictError", { message: `Environment with slug "${data.slug}" already exists` })
    }
    throw err
  }
}

export async function removeEnvironment(id: string) {
  const existing = await getEnvironmentById(id)
  if (existing.protected) {
    throw createError("BadRequestError", { message: "Protected environments cannot be deleted" })
  }

  const [deleted] = await withDb((db) =>
    db.delete(EnvironmentTable).where(eq(EnvironmentTable.id, id)).returning({ id: EnvironmentTable.id }),
  )
  return deleted
}

export async function findNonProtectedEnvironments(input: z.input<typeof FindNonProtectedEnvironmentsSchema>) {
  const protectedSlugs = FindNonProtectedEnvironmentsSchema.parse(input)
  const organizationId = principal.orgId()

  if (protectedSlugs.length === 0) {
    return withDb((db) => db.select().from(EnvironmentTable).where(eq(EnvironmentTable.organizationId, organizationId)))
  }

  return withDb((db) =>
    db
      .select()
      .from(EnvironmentTable)
      .where(
        and(eq(EnvironmentTable.organizationId, organizationId), notInArray(EnvironmentTable.slug, protectedSlugs)),
      ),
  )
}

export async function deleteNonProtectedEnvironments(input: z.input<typeof DeleteNonProtectedEnvironmentsSchema>) {
  const protectedSlugs = DeleteNonProtectedEnvironmentsSchema.parse(input)
  const environments = await findNonProtectedEnvironments(protectedSlugs)
  await Promise.all(environments.map((env) => removeEnvironment(env.id)))
  return environments.length
}

export async function ensureStagingEnvironment(): Promise<boolean> {
  const existing = await findEnvironmentBySlug({ slug: STAGING_ENV.slug })
  if (existing) return false
  await createEnvironment(STAGING_ENV)
  return true
}
