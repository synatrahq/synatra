import { z } from "zod"
import { and, eq, desc, getTableColumns, count } from "drizzle-orm"
import { createHash } from "crypto"
import { principal } from "./principal"
import { withDb, withTx, first } from "./database"
import { AgentTable, AgentReleaseTable, AgentWorkingCopyTable } from "./schema/agent.sql"
import { UserTable } from "./schema/user.sql"
import type { AgentRuntimeConfig } from "./types"
import { AgentRuntimeConfigSchema, SubscriptionPlan, PLAN_LIMITS } from "./types"
import { serializeConfig } from "@synatra/util/normalize"
import { createError } from "@synatra/util/error"
import { bumpVersion, parseVersion, stringifyVersion } from "@synatra/util/version"
import { isReservedSlug } from "@synatra/util/identifier"
import { currentSubscription } from "./subscription"

export const CreateAgentSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().default("CircleDashed"),
  iconColor: z.string().default("blue"),
  templateId: z.string().optional(),
  runtimeConfig: AgentRuntimeConfigSchema.partial().default({}),
  initialVersion: z.string().default("0.0.1"),
  descriptionText: z.string().default("Initial release"),
})

export const UpdateAgentSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  iconColor: z.string().optional(),
})

export const SaveAgentWorkingCopySchema = z.object({
  agentId: z.string(),
  runtimeConfig: AgentRuntimeConfigSchema,
})

export const DeployAgentSchema = z.object({
  agentId: z.string(),
  version: z.string().optional(),
  bump: z.enum(["major", "minor", "patch"]).optional(),
  description: z.string().default(""),
})

export const AdoptAgentSchema = z.object({
  agentId: z.string(),
  releaseId: z.string(),
})

export const CheckoutAgentSchema = z.object({
  agentId: z.string(),
  releaseId: z.string(),
})

export const FindAgentByReleaseSchema = z.object({
  agentId: z.string(),
  releaseId: z.string(),
  organizationId: z.string().optional(),
})

function hashConfig(config: unknown): string {
  return createHash("sha256").update(serializeConfig(config)).digest("hex")
}

async function loadRelease(agentId: string, releaseId: string, orgId?: string) {
  const organizationId = orgId ?? principal.orgId()
  return withDb((db) =>
    db
      .select(getTableColumns(AgentReleaseTable))
      .from(AgentReleaseTable)
      .innerJoin(AgentTable, eq(AgentReleaseTable.agentId, AgentTable.id))
      .where(
        and(
          eq(AgentReleaseTable.id, releaseId),
          eq(AgentTable.id, agentId),
          eq(AgentTable.organizationId, organizationId),
        ),
      )
      .then(first),
  )
}

function releaseValues(input: {
  agentId: string
  version: { major: number; minor: number; patch: number }
  versionText: string
  description: string
  runtimeConfig: AgentRuntimeConfig
  configHash: string
  userId: string
}) {
  return {
    agentId: input.agentId,
    version: input.versionText,
    versionMajor: input.version.major,
    versionMinor: input.version.minor,
    versionPatch: input.version.patch,
    description: input.description,
    runtimeConfig: input.runtimeConfig,
    configHash: input.configHash,
    publishedAt: new Date(),
    createdBy: input.userId,
  }
}

export async function listAgents() {
  const organizationId = principal.orgId()
  return withDb((db) =>
    db
      .select({
        ...getTableColumns(AgentTable),
        version: AgentReleaseTable.version,
        runtimeConfig: AgentReleaseTable.runtimeConfig,
        configHash: AgentReleaseTable.configHash,
      })
      .from(AgentTable)
      .leftJoin(AgentReleaseTable, eq(AgentTable.currentReleaseId, AgentReleaseTable.id))
      .where(eq(AgentTable.organizationId, organizationId))
      .orderBy(desc(AgentTable.createdAt)),
  )
}

export async function findAgentById(id: string) {
  const organizationId = principal.orgId()
  return withDb((db) =>
    db
      .select({
        ...getTableColumns(AgentTable),
        version: AgentReleaseTable.version,
        runtimeConfig: AgentReleaseTable.runtimeConfig,
        configHash: AgentReleaseTable.configHash,
      })
      .from(AgentTable)
      .leftJoin(AgentReleaseTable, eq(AgentTable.currentReleaseId, AgentReleaseTable.id))
      .where(and(eq(AgentTable.id, id), eq(AgentTable.organizationId, organizationId)))
      .then(first),
  )
}

export async function getAgentById(id: string) {
  const agent = await findAgentById(id)
  if (!agent) throw createError("NotFoundError", { type: "Agent", id })
  return agent
}

export async function findAgentBySlug(slug: string) {
  const organizationId = principal.orgId()
  return withDb((db) =>
    db
      .select({
        ...getTableColumns(AgentTable),
        version: AgentReleaseTable.version,
        runtimeConfig: AgentReleaseTable.runtimeConfig,
        configHash: AgentReleaseTable.configHash,
      })
      .from(AgentTable)
      .leftJoin(AgentReleaseTable, eq(AgentTable.currentReleaseId, AgentReleaseTable.id))
      .where(and(eq(AgentTable.organizationId, organizationId), eq(AgentTable.slug, slug)))
      .then(first),
  )
}

export async function createAgent(input: z.input<typeof CreateAgentSchema>) {
  const data = CreateAgentSchema.parse(input)
  if (isReservedSlug(data.slug)) {
    throw createError("BadRequestError", { message: `Slug "${data.slug}" is reserved` })
  }
  const organizationId = principal.orgId()
  const userId = principal.userId()
  const versionParsed = parseVersion(data.initialVersion)
  const versionText = stringifyVersion(versionParsed)
  const configHash = hashConfig(data.runtimeConfig)
  const config = data.runtimeConfig as AgentRuntimeConfig
  const sub = await currentSubscription({})
  const limits = PLAN_LIMITS[sub.plan as SubscriptionPlan]

  let agentId: string
  try {
    agentId = await withTx(async (db) => {
      await db.select().from(AgentTable).where(eq(AgentTable.organizationId, organizationId)).for("update")

      // Agent limit check must be done inside transaction to prevent race conditions
      // We cannot use Plan.checkAgentLimit here because it uses withDb (non-transactional)
      if (limits.agentLimit !== null) {
        const [row] = await db
          .select({ count: count() })
          .from(AgentTable)
          .where(eq(AgentTable.organizationId, organizationId))
        const current = Number(row?.count ?? 0)
        if (current + 1 > limits.agentLimit) {
          throw createError("ResourceLimitError", { resource: "agents", limit: limits.agentLimit, plan: sub.plan })
        }
      }
      const [agent] = await db
        .insert(AgentTable)
        .values({
          organizationId,
          templateId: data.templateId ?? null,
          name: data.name,
          slug: data.slug,
          description: data.description,
          icon: data.icon,
          iconColor: data.iconColor,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning()

      const [release] = await db
        .insert(AgentReleaseTable)
        .values(
          releaseValues({
            agentId: agent.id,
            version: versionParsed,
            versionText,
            description: data.descriptionText,
            runtimeConfig: config,
            configHash,
            userId,
          }),
        )
        .returning()

      await db.insert(AgentWorkingCopyTable).values({
        agentId: agent.id,
        runtimeConfig: config,
        configHash,
        updatedBy: userId,
      })

      await db
        .update(AgentTable)
        .set({ currentReleaseId: release.id, updatedBy: userId, updatedAt: new Date() })
        .where(eq(AgentTable.id, agent.id))

      return agent.id
    })
  } catch (err) {
    if (err instanceof Error && err.message.includes("agent_org_slug_idx")) {
      throw createError("ConflictError", { message: `Agent with slug "${data.slug}" already exists` })
    }
    throw err
  }

  return findAgentById(agentId)
}

export async function updateAgent(input: z.input<typeof UpdateAgentSchema>) {
  const data = UpdateAgentSchema.parse(input)
  if (data.slug !== undefined && isReservedSlug(data.slug)) {
    throw createError("BadRequestError", { message: `Slug "${data.slug}" is reserved` })
  }
  await getAgentById(data.id)
  const userId = principal.userId()
  const updateData = {
    updatedAt: new Date(),
    updatedBy: userId,
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.slug !== undefined ? { slug: data.slug } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
    ...(data.icon !== undefined ? { icon: data.icon } : {}),
    ...(data.iconColor !== undefined ? { iconColor: data.iconColor } : {}),
  }

  if (Object.keys(updateData).length === 2) return findAgentById(data.id)
  try {
    await withDb((db) => db.update(AgentTable).set(updateData).where(eq(AgentTable.id, data.id)))
  } catch (err) {
    if (err instanceof Error && err.message.includes("agent_org_slug_idx")) {
      throw createError("ConflictError", { message: `Agent with slug "${data.slug}" already exists` })
    }
    throw err
  }

  return findAgentById(data.id)
}

export async function saveAgentWorkingCopy(input: z.input<typeof SaveAgentWorkingCopySchema>) {
  const data = SaveAgentWorkingCopySchema.parse(input)
  await getAgentById(data.agentId)
  const configHash = hashConfig(data.runtimeConfig)
  const userId = principal.userId()
  await withDb((db) =>
    db
      .insert(AgentWorkingCopyTable)
      .values({
        agentId: data.agentId,
        runtimeConfig: data.runtimeConfig as AgentRuntimeConfig,
        configHash,
        updatedBy: userId,
      })
      .onConflictDoUpdate({
        target: AgentWorkingCopyTable.agentId,
        set: {
          runtimeConfig: data.runtimeConfig as AgentRuntimeConfig,
          configHash,
          updatedBy: userId,
          updatedAt: new Date(),
        },
      }),
  )
  return { agentId: data.agentId, configHash }
}

export async function deployAgent(input: z.input<typeof DeployAgentSchema>) {
  const data = DeployAgentSchema.parse(input)
  await getAgentById(data.agentId)
  const working = await withDb((db) =>
    db
      .select({
        agentId: AgentWorkingCopyTable.agentId,
        runtimeConfig: AgentWorkingCopyTable.runtimeConfig,
        configHash: AgentWorkingCopyTable.configHash,
      })
      .from(AgentWorkingCopyTable)
      .where(eq(AgentWorkingCopyTable.agentId, data.agentId))
      .then(first),
  )
  if (!working) throw new Error("Working copy not found")
  if (data.version && data.bump) throw new Error("Specify either version or bump, not both")

  const config = working.runtimeConfig as AgentRuntimeConfig
  const userId = principal.userId()

  const [release] = await withTx(async (db) => {
    const latest = await db
      .select({
        major: AgentReleaseTable.versionMajor,
        minor: AgentReleaseTable.versionMinor,
        patch: AgentReleaseTable.versionPatch,
      })
      .from(AgentReleaseTable)
      .where(eq(AgentReleaseTable.agentId, data.agentId))
      .orderBy(
        desc(AgentReleaseTable.versionMajor),
        desc(AgentReleaseTable.versionMinor),
        desc(AgentReleaseTable.versionPatch),
      )
      .limit(1)
      .then(first)
    const target = data.version ? parseVersion(data.version) : bumpVersion(latest ?? null, data.bump ?? "patch")

    const [created] = await db
      .insert(AgentReleaseTable)
      .values(
        releaseValues({
          agentId: data.agentId,
          version: target,
          versionText: stringifyVersion(target),
          description: data.description,
          runtimeConfig: config,
          configHash: working.configHash,
          userId,
        }),
      )
      .returning()

    await db
      .update(AgentTable)
      .set({ currentReleaseId: created.id, updatedAt: new Date(), updatedBy: userId })
      .where(eq(AgentTable.id, data.agentId))
    await db
      .update(AgentWorkingCopyTable)
      .set({ updatedAt: new Date(), updatedBy: userId })
      .where(eq(AgentWorkingCopyTable.agentId, data.agentId))
    return [created]
  })
  return release
}

export async function adoptAgent(input: z.input<typeof AdoptAgentSchema>) {
  const data = AdoptAgentSchema.parse(input)
  const release = await loadRelease(data.agentId, data.releaseId)
  if (!release) throw new Error("Release not found")
  const userId = principal.userId()
  await withDb((db) =>
    db
      .update(AgentTable)
      .set({ currentReleaseId: release.id, updatedAt: new Date(), updatedBy: userId })
      .where(eq(AgentTable.id, data.agentId)),
  )
  return release
}

export async function checkoutAgent(input: z.input<typeof CheckoutAgentSchema>) {
  const data = CheckoutAgentSchema.parse(input)
  const release = await loadRelease(data.agentId, data.releaseId)
  if (!release) throw new Error("Release not found")
  const userId = principal.userId()
  const config = release.runtimeConfig as AgentRuntimeConfig
  const configHash = release.configHash
  await withDb((db) =>
    db
      .insert(AgentWorkingCopyTable)
      .values({ agentId: data.agentId, runtimeConfig: config, configHash, updatedBy: userId })
      .onConflictDoUpdate({
        target: AgentWorkingCopyTable.agentId,
        set: { runtimeConfig: config, configHash, updatedBy: userId, updatedAt: new Date() },
      }),
  )
  return { agentId: data.agentId, releaseId: data.releaseId }
}

export async function getAgentWorkingCopy(agentId: string) {
  await getAgentById(agentId)
  return withDb((db) =>
    db
      .select(getTableColumns(AgentWorkingCopyTable))
      .from(AgentWorkingCopyTable)
      .where(eq(AgentWorkingCopyTable.agentId, agentId))
      .then(first),
  )
}

export async function listAgentReleases(agentId: string) {
  const organizationId = principal.orgId()
  return withDb((db) =>
    db
      .select({
        ...getTableColumns(AgentReleaseTable),
        createdBy: { id: UserTable.id, name: UserTable.name, email: UserTable.email, image: UserTable.image },
      })
      .from(AgentReleaseTable)
      .innerJoin(AgentTable, eq(AgentReleaseTable.agentId, AgentTable.id))
      .innerJoin(UserTable, eq(AgentReleaseTable.createdBy, UserTable.id))
      .where(and(eq(AgentReleaseTable.agentId, agentId), eq(AgentTable.organizationId, organizationId)))
      .orderBy(
        desc(AgentReleaseTable.versionMajor),
        desc(AgentReleaseTable.versionMinor),
        desc(AgentReleaseTable.versionPatch),
        desc(AgentReleaseTable.createdAt),
      ),
  )
}

export async function removeAgent(id: string) {
  await getAgentById(id)
  const [deleted] = await withDb((db) =>
    db.delete(AgentTable).where(eq(AgentTable.id, id)).returning({ id: AgentTable.id }),
  )
  return deleted
}

export async function findAgentByRelease(input: z.input<typeof FindAgentByReleaseSchema>) {
  const { agentId, releaseId, organizationId } = FindAgentByReleaseSchema.parse(input)
  const release = await loadRelease(agentId, releaseId, organizationId)
  if (!release) return null
  return {
    id: release.id,
    agentId: release.agentId,
    version: release.version,
    runtimeConfig: release.runtimeConfig,
    configHash: release.configHash,
  }
}
