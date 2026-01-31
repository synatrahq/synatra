import { z } from "zod"
import { eq, and, desc, lt, or, getTableColumns, sql, inArray } from "drizzle-orm"
import { createHash } from "crypto"
import { principal } from "./principal"
import { withDb, withTx, first } from "./database"
import {
  RecipeTable,
  RecipeReleaseTable,
  RecipeWorkingCopyTable,
  RecipeStepTable,
  RecipeEdgeTable,
  RecipeExecutionTable,
} from "./schema/recipe.sql"
import { ChannelRecipeTable } from "./schema/channel-recipe.sql"
import { UserTable } from "./schema/user.sql"
import { MemberTable } from "./schema/member.sql"
import { ChannelMemberTable } from "./schema/channel-member.sql"
import { createError } from "@synatra/util/error"
import { generateSlug, generateRandomId, isReservedSlug } from "@synatra/util/identifier"
import { bumpVersion, parseVersion, stringifyVersion } from "@synatra/util/version"
import { serializeConfig } from "@synatra/util/normalize"
import {
  RecipeInputSchema,
  RecipeOutputSchema,
  PendingInputConfigSchema,
  RecipeStepInputSchema,
  type Value,
  type RecipeStepConfig,
} from "./types"

function parseCursor(cursor: string): { date: Date; id: string } {
  const underscoreIndex = cursor.lastIndexOf("_")
  if (underscoreIndex === -1) {
    throw createError("BadRequestError", { message: "Invalid cursor format" })
  }
  const cursorDate = cursor.slice(0, underscoreIndex)
  const cursorId = cursor.slice(underscoreIndex + 1)
  const parsed = new Date(cursorDate)
  if (isNaN(parsed.getTime())) {
    throw createError("BadRequestError", { message: "Invalid cursor date" })
  }
  return { date: parsed, id: cursorId }
}

function hashConfig(config: Record<string, unknown>): string {
  return createHash("sha256").update(serializeConfig(config)).digest("hex")
}

export function extractBindingRefs(binding: Value): string[] {
  const refs: string[] = []
  function walk(b: Value): void {
    if (b.type === "ref" && b.scope === "step") refs.push(b.key)
    if (b.type === "template") {
      for (const part of b.parts) {
        if (typeof part !== "string") walk(part)
      }
    }
    if (b.type === "object") Object.values(b.entries).forEach(walk)
    if (b.type === "array") b.items.forEach(walk)
  }
  walk(binding)
  return [...new Set(refs)]
}

export function collectStepRefs(config: RecipeStepConfig): string[] {
  const refs: string[] = []
  if ("code" in config && config.code) {
    refs.push(...extractBindingRefs(config.code as Value))
  }
  if ("timeoutMs" in config && config.timeoutMs) {
    refs.push(...extractBindingRefs(config.timeoutMs as Value))
  }
  if ("name" in config && config.name) {
    refs.push(...extractBindingRefs(config.name as Value))
  }
  if ("params" in config && config.params && typeof config.params === "object") {
    if ("type" in config.params) {
      refs.push(...extractBindingRefs(config.params as Value))
    } else if ("fields" in config.params) {
      const params = config.params as {
        fields: Array<Record<string, Value>>
        title: Value
        description?: Value
      }
      refs.push(...extractBindingRefs(params.title))
      if (params.description) refs.push(...extractBindingRefs(params.description as Value))
      for (const field of params.fields) {
        for (const value of Object.values(field)) {
          if (value === undefined) continue
          refs.push(...extractBindingRefs(value))
        }
      }
    }
  }
  return refs
}

export function validateStepBindings(steps: Array<{ stepKey: string; config: RecipeStepConfig }>): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []
  const precedingKeys = new Set<string>()

  for (const step of steps) {
    for (const ref of collectStepRefs(step.config)) {
      if (!precedingKeys.has(ref)) {
        errors.push(`Step "${step.stepKey}" references "${ref}" which is not a preceding step`)
      }
    }
    precedingKeys.add(step.stepKey)
  }

  return { valid: errors.length === 0, errors }
}

function orderStepsByEdgeChain<T extends { id: string }>(
  steps: T[],
  edges: Array<{ fromStepId: string; toStepId: string }>,
): T[] {
  if (steps.length === 0) return []

  const stepById = new Map(steps.map((s) => [s.id, s]))
  const indexById = new Map(steps.map((s, index) => [s.id, index]))
  const adjacency = new Map<string, string[]>()
  const inDegree = new Map<string, number>()
  for (const step of steps) {
    adjacency.set(step.id, [])
    inDegree.set(step.id, 0)
  }
  for (const edge of edges) {
    if (!stepById.has(edge.fromStepId) || !stepById.has(edge.toStepId)) continue
    adjacency.get(edge.fromStepId)?.push(edge.toStepId)
    inDegree.set(edge.toStepId, (inDegree.get(edge.toStepId) ?? 0) + 1)
  }

  const ordered: T[] = []
  const visited = new Set<string>()
  const available = steps.filter((step) => (inDegree.get(step.id) ?? 0) === 0).map((step) => step.id)

  while (available.length > 0) {
    available.sort((a, b) => (indexById.get(a) ?? 0) - (indexById.get(b) ?? 0))
    const currentId = available.shift()
    if (!currentId || visited.has(currentId)) continue
    visited.add(currentId)
    const step = stepById.get(currentId)
    if (step) ordered.push(step)
    for (const nextId of adjacency.get(currentId) ?? []) {
      inDegree.set(nextId, (inDegree.get(nextId) ?? 0) - 1)
      if ((inDegree.get(nextId) ?? 0) === 0) {
        available.push(nextId)
      }
    }
  }

  if (ordered.length === steps.length) return ordered
  for (const step of steps) {
    if (!visited.has(step.id)) {
      ordered.push(step)
    }
  }

  return ordered
}

async function getAccessibleChannelIds(): Promise<string[] | null> {
  const organizationId = principal.orgId()
  const userId = principal.userId()

  const member = await withDb((db) =>
    db
      .select()
      .from(MemberTable)
      .where(and(eq(MemberTable.userId, userId), eq(MemberTable.organizationId, organizationId)))
      .then(first),
  )

  if (!member) return []
  if (member.role === "owner" || member.role === "admin") return null

  const channelMembers = await withDb((db) =>
    db
      .select({ channelId: ChannelMemberTable.channelId })
      .from(ChannelMemberTable)
      .where(eq(ChannelMemberTable.memberId, member.id)),
  )

  return channelMembers.map((cm) => cm.channelId)
}

async function canAccessRecipeViaChannel(recipeId: string): Promise<boolean> {
  const accessibleChannels = await getAccessibleChannelIds()
  if (accessibleChannels === null) return true

  const channelRecipes = await withDb((db) =>
    db
      .select({ channelId: ChannelRecipeTable.channelId })
      .from(ChannelRecipeTable)
      .where(eq(ChannelRecipeTable.recipeId, recipeId)),
  )

  if (channelRecipes.length === 0) return true

  return channelRecipes.some((cr) => accessibleChannels.includes(cr.channelId))
}

export const CreateRecipeSchema = z.object({
  agentId: z.string().optional(),
  channelIds: z.array(z.string()).optional(),
  sourceThreadId: z.string().optional(),
  sourceRunId: z.string().optional(),
  name: z.string().min(1),
  slug: z.string().optional(),
  description: z.string().optional(),
  agentReleaseId: z.string().nullable().optional(),
  agentVersionMode: z.enum(["current", "fixed"]).default("current"),
  inputs: z.array(RecipeInputSchema),
  outputs: z.array(RecipeOutputSchema),
  steps: z.array(RecipeStepInputSchema),
})

export async function createRecipe(raw: z.input<typeof CreateRecipeSchema>) {
  const input = CreateRecipeSchema.parse(raw)
  const organizationId = principal.orgId()
  const userId = principal.userId()
  const slug = input.slug || generateSlug(input.name) || generateRandomId()

  if (isReservedSlug(slug)) {
    throw createError("BadRequestError", { message: `Slug "${slug}" is reserved` })
  }

  if (input.steps.length > 0) {
    const bindingValidation = validateStepBindings(input.steps)
    if (!bindingValidation.valid) {
      throw createError("BadRequestError", { message: bindingValidation.errors.join("; ") })
    }
  }

  const versionParsed = parseVersion("0.0.1")
  const versionText = stringifyVersion(versionParsed)

  const configData = {
    agentReleaseId: input.agentReleaseId ?? null,
    agentVersionMode: input.agentVersionMode,
    inputs: input.inputs,
    outputs: input.outputs,
  }
  const configHashValue = hashConfig(configData)

  let recipeId: string
  try {
    recipeId = await withTx(async (db) => {
      const [recipe] = await db
        .insert(RecipeTable)
        .values({
          organizationId,
          agentId: input.agentId ?? null,
          sourceThreadId: input.sourceThreadId,
          sourceRunId: input.sourceRunId,
          name: input.name,
          slug,
          description: input.description,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning()

      if (input.channelIds && input.channelIds.length > 0) {
        await db.insert(ChannelRecipeTable).values(
          input.channelIds.map((channelId) => ({
            channelId,
            recipeId: recipe.id,
            createdBy: userId,
          })),
        )
      }

      const [release] = await db
        .insert(RecipeReleaseTable)
        .values({
          recipeId: recipe.id,
          version: versionText,
          versionMajor: versionParsed.major,
          versionMinor: versionParsed.minor,
          versionPatch: versionParsed.patch,
          description: "Initial release",
          agentReleaseId: input.agentReleaseId ?? null,
          agentVersionMode: input.agentVersionMode,
          inputs: input.inputs,
          outputs: input.outputs,
          configHash: configHashValue,
          publishedAt: new Date(),
          createdBy: userId,
        })
        .returning()

      await db.insert(RecipeWorkingCopyTable).values({
        recipeId: recipe.id,
        agentReleaseId: input.agentReleaseId ?? null,
        agentVersionMode: input.agentVersionMode,
        inputs: input.inputs,
        outputs: input.outputs,
        configHash: configHashValue,
        updatedBy: userId,
      })

      if (input.steps.length > 0) {
        await db.insert(RecipeStepTable).values(
          input.steps.map((step) => ({
            releaseId: release.id,
            stepKey: step.stepKey,
            label: step.label,
            type: step.type,
            config: step.config,
          })),
        )

        await db.insert(RecipeStepTable).values(
          input.steps.map((step) => ({
            workingCopyRecipeId: recipe.id,
            stepKey: step.stepKey,
            label: step.label,
            type: step.type,
            config: step.config,
          })),
        )

        const releaseSteps = await db
          .select({ id: RecipeStepTable.id, stepKey: RecipeStepTable.stepKey })
          .from(RecipeStepTable)
          .where(eq(RecipeStepTable.releaseId, release.id))
          .orderBy(RecipeStepTable.createdAt, RecipeStepTable.id)

        const workingSteps = await db
          .select({ id: RecipeStepTable.id, stepKey: RecipeStepTable.stepKey })
          .from(RecipeStepTable)
          .where(eq(RecipeStepTable.workingCopyRecipeId, recipe.id))
          .orderBy(RecipeStepTable.createdAt, RecipeStepTable.id)

        const releaseKeyToId = new Map(releaseSteps.map((s) => [s.stepKey, s.id]))
        const workingKeyToId = new Map(workingSteps.map((s) => [s.stepKey, s.id]))

        const edges: Array<{
          releaseId?: string
          workingCopyRecipeId?: string
          fromStepId: string
          toStepId: string
        }> = []
        for (let i = 1; i < input.steps.length; i++) {
          const prevKey = input.steps[i - 1].stepKey
          const currKey = input.steps[i].stepKey
          const releaseFromId = releaseKeyToId.get(prevKey)
          const releaseToId = releaseKeyToId.get(currKey)
          const workingFromId = workingKeyToId.get(prevKey)
          const workingToId = workingKeyToId.get(currKey)
          if (releaseFromId && releaseToId) {
            edges.push({ releaseId: release.id, fromStepId: releaseFromId, toStepId: releaseToId })
          }
          if (workingFromId && workingToId) {
            edges.push({ workingCopyRecipeId: recipe.id, fromStepId: workingFromId, toStepId: workingToId })
          }
        }
        if (edges.length > 0) {
          await db.insert(RecipeEdgeTable).values(edges)
        }
      }

      await db
        .update(RecipeTable)
        .set({ currentReleaseId: release.id, updatedBy: userId, updatedAt: new Date() })
        .where(eq(RecipeTable.id, recipe.id))

      return recipe.id
    })
  } catch (err) {
    if (err instanceof Error && err.message.includes("recipe_org_slug_idx")) {
      throw createError("ConflictError", { message: `Recipe with slug "${slug}" already exists` })
    }
    throw err
  }

  return getRecipeById(recipeId)
}

export const UpdateRecipeSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  description: z.string().optional(),
})

export async function updateRecipe(raw: z.input<typeof UpdateRecipeSchema>) {
  const input = UpdateRecipeSchema.parse(raw)
  const organizationId = principal.orgId()

  if (input.slug !== undefined && isReservedSlug(input.slug)) {
    throw createError("BadRequestError", { message: `Slug "${input.slug}" is reserved` })
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date(), updatedBy: principal.userId() }
  if (input.name !== undefined) updateData.name = input.name
  if (input.slug !== undefined) updateData.slug = input.slug
  if (input.description !== undefined) updateData.description = input.description

  try {
    const [updated] = await withDb((db) =>
      db
        .update(RecipeTable)
        .set(updateData)
        .where(and(eq(RecipeTable.id, input.id), eq(RecipeTable.organizationId, organizationId)))
        .returning(),
    )

    if (!updated) throw createError("NotFoundError", { type: "Recipe", id: input.id })
    return updated
  } catch (err) {
    if (err instanceof Error && err.message.includes("recipe_org_slug_idx")) {
      throw createError("ConflictError", { message: `Recipe with slug "${input.slug}" already exists` })
    }
    throw err
  }
}

export async function getRecipeById(id: string) {
  const organizationId = principal.orgId()
  const recipe = await withDb((db) =>
    db
      .select()
      .from(RecipeTable)
      .where(and(eq(RecipeTable.id, id), eq(RecipeTable.organizationId, organizationId)))
      .then(first),
  )

  if (!recipe) throw createError("NotFoundError", { type: "Recipe", id })

  if (!(await canAccessRecipeViaChannel(recipe.id))) {
    throw createError("ForbiddenError", { message: "Access denied to this recipe" })
  }

  return recipe
}

export async function findRecipeById(id: string) {
  const organizationId = principal.orgId()
  const recipe = await withDb((db) =>
    db
      .select()
      .from(RecipeTable)
      .where(and(eq(RecipeTable.id, id), eq(RecipeTable.organizationId, organizationId)))
      .then(first),
  )

  if (!recipe) return null

  if (!(await canAccessRecipeViaChannel(recipe.id))) {
    return null
  }

  return recipe
}

export const ListRecipesSchema = z
  .object({
    agentId: z.string().optional(),
    channelId: z.string().optional(),
    cursor: z.string().optional(),
    limit: z.number().min(1).max(100).optional(),
  })
  .optional()

export async function listRecipes(raw?: z.input<typeof ListRecipesSchema>) {
  const filters = ListRecipesSchema.parse(raw)
  const organizationId = principal.orgId()
  const limit = filters?.limit ?? 20

  const accessibleChannels = await getAccessibleChannelIds()

  const conditions = [eq(RecipeTable.organizationId, organizationId)]

  if (filters?.agentId) {
    conditions.push(eq(RecipeTable.agentId, filters.agentId))
  }
  if (filters?.cursor) {
    const { date, id } = parseCursor(filters.cursor)
    conditions.push(or(lt(RecipeTable.createdAt, date), and(eq(RecipeTable.createdAt, date), lt(RecipeTable.id, id)))!)
  }

  let recipes = await withDb((db) =>
    db
      .select({
        ...getTableColumns(RecipeTable),
        version: RecipeReleaseTable.version,
        inputs: RecipeReleaseTable.inputs,
        outputs: RecipeReleaseTable.outputs,
      })
      .from(RecipeTable)
      .leftJoin(RecipeReleaseTable, eq(RecipeTable.currentReleaseId, RecipeReleaseTable.id))
      .where(and(...conditions))
      .orderBy(desc(RecipeTable.createdAt), desc(RecipeTable.id))
      .limit(limit * 2 + 1),
  )

  if (filters?.channelId) {
    if (accessibleChannels !== null && !accessibleChannels.includes(filters.channelId)) {
      return { items: [], nextCursor: null }
    }

    const channelRecipes = await withDb((db) =>
      db
        .select({ recipeId: ChannelRecipeTable.recipeId })
        .from(ChannelRecipeTable)
        .where(eq(ChannelRecipeTable.channelId, filters.channelId!)),
    )
    const channelRecipeIds = new Set(channelRecipes.map((cr) => cr.recipeId))
    recipes = recipes.filter((r) => channelRecipeIds.has(r.id))
  }

  if (accessibleChannels !== null) {
    const recipeIds = recipes.map((r) => r.id)
    if (recipeIds.length > 0) {
      const channelRecipes = await withDb((db) =>
        db
          .select({ recipeId: ChannelRecipeTable.recipeId, channelId: ChannelRecipeTable.channelId })
          .from(ChannelRecipeTable)
          .where(inArray(ChannelRecipeTable.recipeId, recipeIds)),
      )

      const recipeChannelMap = new Map<string, string[]>()
      for (const cr of channelRecipes) {
        const channels = recipeChannelMap.get(cr.recipeId) ?? []
        channels.push(cr.channelId)
        recipeChannelMap.set(cr.recipeId, channels)
      }

      recipes = recipes.filter((r) => {
        const channels = recipeChannelMap.get(r.id)
        if (!channels || channels.length === 0) return true
        return channels.some((ch) => accessibleChannels.includes(ch))
      })
    }
  }

  const hasMore = recipes.length > limit
  const items = hasMore ? recipes.slice(0, limit) : recipes
  const nextCursor = hasMore ? `${items[items.length - 1].createdAt.toISOString()}_${items[items.length - 1].id}` : null

  return { items, nextCursor }
}

export const DeleteRecipeSchema = z.object({ id: z.string() })

export async function deleteRecipe(raw: z.input<typeof DeleteRecipeSchema>) {
  const input = DeleteRecipeSchema.parse(raw)
  const organizationId = principal.orgId()

  const [deleted] = await withDb((db) =>
    db
      .delete(RecipeTable)
      .where(and(eq(RecipeTable.id, input.id), eq(RecipeTable.organizationId, organizationId)))
      .returning({ id: RecipeTable.id }),
  )

  return deleted ?? null
}

export const SaveRecipeWorkingCopySchema = z.object({
  recipeId: z.string(),
  agentReleaseId: z.string().nullable().optional(),
  agentVersionMode: z.enum(["current", "fixed"]).optional(),
  inputs: z.array(RecipeInputSchema).optional(),
  outputs: z.array(RecipeOutputSchema).optional(),
  steps: z.array(RecipeStepInputSchema).optional(),
})

export async function saveRecipeWorkingCopy(raw: z.input<typeof SaveRecipeWorkingCopySchema>) {
  const input = SaveRecipeWorkingCopySchema.parse(raw)
  await getRecipeById(input.recipeId)

  const existing = await withDb((db) =>
    db.select().from(RecipeWorkingCopyTable).where(eq(RecipeWorkingCopyTable.recipeId, input.recipeId)).then(first),
  )

  const agentReleaseId = input.agentReleaseId ?? existing?.agentReleaseId ?? null
  const agentVersionMode = input.agentVersionMode ?? existing?.agentVersionMode ?? "current"
  const inputs = input.inputs ?? existing?.inputs ?? []
  const outputs = input.outputs ?? existing?.outputs ?? []

  const configData = { agentReleaseId, agentVersionMode, inputs, outputs }
  const configHashValue = hashConfig(configData)
  const userId = principal.userId()

  if (input.steps !== undefined && input.steps.length > 0) {
    const bindingValidation = validateStepBindings(input.steps)
    if (!bindingValidation.valid) {
      throw createError("BadRequestError", { message: bindingValidation.errors.join("; ") })
    }
  }

  await withTx(async (db) => {
    await db
      .insert(RecipeWorkingCopyTable)
      .values({
        recipeId: input.recipeId,
        agentReleaseId,
        agentVersionMode,
        inputs,
        outputs,
        configHash: configHashValue,
        updatedBy: userId,
      })
      .onConflictDoUpdate({
        target: RecipeWorkingCopyTable.recipeId,
        set: {
          agentReleaseId,
          agentVersionMode,
          inputs,
          outputs,
          configHash: configHashValue,
          updatedBy: userId,
          updatedAt: new Date(),
        },
      })

    if (input.steps !== undefined) {
      await db.delete(RecipeStepTable).where(eq(RecipeStepTable.workingCopyRecipeId, input.recipeId))
      await db.delete(RecipeEdgeTable).where(eq(RecipeEdgeTable.workingCopyRecipeId, input.recipeId))

      if (input.steps.length > 0) {
        await db.insert(RecipeStepTable).values(
          input.steps.map((step) => ({
            workingCopyRecipeId: input.recipeId,
            stepKey: step.stepKey,
            label: step.label,
            type: step.type,
            config: step.config,
          })),
        )

        const insertedSteps = await db
          .select({ id: RecipeStepTable.id, stepKey: RecipeStepTable.stepKey })
          .from(RecipeStepTable)
          .where(eq(RecipeStepTable.workingCopyRecipeId, input.recipeId))
          .orderBy(RecipeStepTable.createdAt, RecipeStepTable.id)

        const keyToId = new Map(insertedSteps.map((s) => [s.stepKey, s.id]))

        const edges: Array<{ workingCopyRecipeId: string; fromStepId: string; toStepId: string }> = []
        for (let i = 1; i < input.steps.length; i++) {
          const prevKey = input.steps[i - 1].stepKey
          const currKey = input.steps[i].stepKey
          const fromId = keyToId.get(prevKey)
          const toId = keyToId.get(currKey)
          if (fromId && toId) {
            edges.push({ workingCopyRecipeId: input.recipeId, fromStepId: fromId, toStepId: toId })
          }
        }
        if (edges.length > 0) {
          await db.insert(RecipeEdgeTable).values(edges)
        }
      }
    }

    await db
      .update(RecipeTable)
      .set({ updatedAt: new Date(), updatedBy: userId })
      .where(eq(RecipeTable.id, input.recipeId))
  })

  return { recipeId: input.recipeId, configHash: configHashValue }
}

export async function getRecipeWorkingCopy(recipeId: string) {
  await getRecipeById(recipeId)

  const workingCopy = await withDb((db) =>
    db.select().from(RecipeWorkingCopyTable).where(eq(RecipeWorkingCopyTable.recipeId, recipeId)).then(first),
  )

  if (!workingCopy) throw createError("NotFoundError", { type: "RecipeWorkingCopy", id: recipeId })

  const rawSteps = await withDb((db) =>
    db.select().from(RecipeStepTable).where(eq(RecipeStepTable.workingCopyRecipeId, recipeId)),
  )

  const edges = await withDb((db) =>
    db.select().from(RecipeEdgeTable).where(eq(RecipeEdgeTable.workingCopyRecipeId, recipeId)),
  )

  const steps = orderStepsByEdgeChain(rawSteps, edges)

  return { ...workingCopy, steps, edges }
}

export const DeployRecipeSchema = z.object({
  recipeId: z.string(),
  version: z.string().optional(),
  bump: z.enum(["major", "minor", "patch"]).optional(),
  description: z.string().default(""),
})

export async function deployRecipe(raw: z.input<typeof DeployRecipeSchema>) {
  const input = DeployRecipeSchema.parse(raw)
  await getRecipeById(input.recipeId)

  const working = await withDb((db) =>
    db.select().from(RecipeWorkingCopyTable).where(eq(RecipeWorkingCopyTable.recipeId, input.recipeId)).then(first),
  )
  if (!working) throw createError("NotFoundError", { type: "RecipeWorkingCopy", id: input.recipeId })

  if (input.version && input.bump)
    throw createError("BadRequestError", { message: "Specify either version or bump, not both" })

  const userId = principal.userId()

  const [release] = await withTx(async (db) => {
    const latest = await db
      .select({
        major: RecipeReleaseTable.versionMajor,
        minor: RecipeReleaseTable.versionMinor,
        patch: RecipeReleaseTable.versionPatch,
      })
      .from(RecipeReleaseTable)
      .where(eq(RecipeReleaseTable.recipeId, input.recipeId))
      .orderBy(
        desc(RecipeReleaseTable.versionMajor),
        desc(RecipeReleaseTable.versionMinor),
        desc(RecipeReleaseTable.versionPatch),
      )
      .limit(1)
      .then(first)

    const target = input.version ? parseVersion(input.version) : bumpVersion(latest ?? null, input.bump ?? "patch")

    const [created] = await db
      .insert(RecipeReleaseTable)
      .values({
        recipeId: input.recipeId,
        version: stringifyVersion(target),
        versionMajor: target.major,
        versionMinor: target.minor,
        versionPatch: target.patch,
        description: input.description,
        agentReleaseId: working.agentReleaseId,
        agentVersionMode: working.agentVersionMode,
        inputs: working.inputs,
        outputs: working.outputs,
        configHash: working.configHash,
        publishedAt: new Date(),
        createdBy: userId,
      })
      .returning()

    const workingSteps = await db
      .select()
      .from(RecipeStepTable)
      .where(eq(RecipeStepTable.workingCopyRecipeId, input.recipeId))
      .orderBy(RecipeStepTable.createdAt, RecipeStepTable.id)

    if (workingSteps.length > 0) {
      await db.insert(RecipeStepTable).values(
        workingSteps.map((step) => ({
          releaseId: created.id,
          stepKey: step.stepKey,
          label: step.label,
          type: step.type,
          config: step.config,
        })),
      )
    }

    const workingEdges = await db
      .select()
      .from(RecipeEdgeTable)
      .where(eq(RecipeEdgeTable.workingCopyRecipeId, input.recipeId))

    if (workingEdges.length > 0) {
      const workingSteps = await db
        .select({ id: RecipeStepTable.id, stepKey: RecipeStepTable.stepKey })
        .from(RecipeStepTable)
        .where(eq(RecipeStepTable.workingCopyRecipeId, input.recipeId))

      const releaseSteps = await db
        .select({ id: RecipeStepTable.id, stepKey: RecipeStepTable.stepKey })
        .from(RecipeStepTable)
        .where(eq(RecipeStepTable.releaseId, created.id))

      const workingIdToKey = new Map(workingSteps.map((s) => [s.id, s.stepKey]))
      const releaseKeyToId = new Map(releaseSteps.map((s) => [s.stepKey, s.id]))

      const releaseEdges = workingEdges
        .map((edge) => {
          const fromKey = workingIdToKey.get(edge.fromStepId)
          const toKey = workingIdToKey.get(edge.toStepId)
          if (!fromKey || !toKey) return null
          const fromId = releaseKeyToId.get(fromKey)
          const toId = releaseKeyToId.get(toKey)
          if (!fromId || !toId) return null
          return { releaseId: created.id, fromStepId: fromId, toStepId: toId }
        })
        .filter((e): e is NonNullable<typeof e> => e !== null)

      if (releaseEdges.length > 0) {
        await db.insert(RecipeEdgeTable).values(releaseEdges)
      }
    }

    await db
      .update(RecipeTable)
      .set({ currentReleaseId: created.id, updatedAt: new Date(), updatedBy: userId })
      .where(eq(RecipeTable.id, input.recipeId))

    await db
      .update(RecipeWorkingCopyTable)
      .set({ updatedAt: new Date(), updatedBy: userId })
      .where(eq(RecipeWorkingCopyTable.recipeId, input.recipeId))

    return [created]
  })

  return release
}

export const AdoptRecipeSchema = z.object({ recipeId: z.string(), releaseId: z.string() })

export async function adoptRecipe(raw: z.input<typeof AdoptRecipeSchema>) {
  const input = AdoptRecipeSchema.parse(raw)
  await getRecipeById(input.recipeId)

  const release = await withDb((db) =>
    db
      .select()
      .from(RecipeReleaseTable)
      .where(and(eq(RecipeReleaseTable.id, input.releaseId), eq(RecipeReleaseTable.recipeId, input.recipeId)))
      .then(first),
  )

  if (!release) throw createError("NotFoundError", { type: "RecipeRelease", id: input.releaseId })

  const userId = principal.userId()
  await withDb((db) =>
    db
      .update(RecipeTable)
      .set({ currentReleaseId: release.id, updatedAt: new Date(), updatedBy: userId })
      .where(eq(RecipeTable.id, input.recipeId)),
  )

  return release
}

export const CheckoutRecipeSchema = z.object({ recipeId: z.string(), releaseId: z.string() })

export async function checkoutRecipe(raw: z.input<typeof CheckoutRecipeSchema>) {
  const input = CheckoutRecipeSchema.parse(raw)
  await getRecipeById(input.recipeId)

  const release = await withDb((db) =>
    db
      .select()
      .from(RecipeReleaseTable)
      .where(and(eq(RecipeReleaseTable.id, input.releaseId), eq(RecipeReleaseTable.recipeId, input.recipeId)))
      .then(first),
  )

  if (!release) throw createError("NotFoundError", { type: "RecipeRelease", id: input.releaseId })

  const userId = principal.userId()

  await withTx(async (db) => {
    await db
      .insert(RecipeWorkingCopyTable)
      .values({
        recipeId: input.recipeId,
        agentReleaseId: release.agentReleaseId,
        agentVersionMode: release.agentVersionMode,
        inputs: release.inputs,
        outputs: release.outputs,
        configHash: release.configHash,
        updatedBy: userId,
      })
      .onConflictDoUpdate({
        target: RecipeWorkingCopyTable.recipeId,
        set: {
          agentReleaseId: release.agentReleaseId,
          agentVersionMode: release.agentVersionMode,
          inputs: release.inputs,
          outputs: release.outputs,
          configHash: release.configHash,
          updatedBy: userId,
          updatedAt: new Date(),
        },
      })

    await db.delete(RecipeStepTable).where(eq(RecipeStepTable.workingCopyRecipeId, input.recipeId))
    await db.delete(RecipeEdgeTable).where(eq(RecipeEdgeTable.workingCopyRecipeId, input.recipeId))

    const releaseSteps = await db
      .select()
      .from(RecipeStepTable)
      .where(eq(RecipeStepTable.releaseId, input.releaseId))
      .orderBy(RecipeStepTable.createdAt, RecipeStepTable.id)

    if (releaseSteps.length > 0) {
      await db.insert(RecipeStepTable).values(
        releaseSteps.map((step) => ({
          workingCopyRecipeId: input.recipeId,
          stepKey: step.stepKey,
          label: step.label,
          type: step.type,
          config: step.config,
        })),
      )
    }

    const releaseEdges = await db.select().from(RecipeEdgeTable).where(eq(RecipeEdgeTable.releaseId, input.releaseId))

    if (releaseEdges.length > 0) {
      const releaseStepsForEdges = await db
        .select({ id: RecipeStepTable.id, stepKey: RecipeStepTable.stepKey })
        .from(RecipeStepTable)
        .where(eq(RecipeStepTable.releaseId, input.releaseId))

      const workingStepsForEdges = await db
        .select({ id: RecipeStepTable.id, stepKey: RecipeStepTable.stepKey })
        .from(RecipeStepTable)
        .where(eq(RecipeStepTable.workingCopyRecipeId, input.recipeId))

      const releaseIdToKey = new Map(releaseStepsForEdges.map((s) => [s.id, s.stepKey]))
      const workingKeyToId = new Map(workingStepsForEdges.map((s) => [s.stepKey, s.id]))

      const workingEdges = releaseEdges
        .map((edge) => {
          const fromKey = releaseIdToKey.get(edge.fromStepId)
          const toKey = releaseIdToKey.get(edge.toStepId)
          if (!fromKey || !toKey) return null
          const fromId = workingKeyToId.get(fromKey)
          const toId = workingKeyToId.get(toKey)
          if (!fromId || !toId) return null
          return { workingCopyRecipeId: input.recipeId, fromStepId: fromId, toStepId: toId }
        })
        .filter((e): e is NonNullable<typeof e> => e !== null)

      if (workingEdges.length > 0) {
        await db.insert(RecipeEdgeTable).values(workingEdges)
      }
    }
  })

  return { recipeId: input.recipeId, releaseId: input.releaseId }
}

export async function getRecipeStepCount(releaseIds: string[]): Promise<Map<string, number>> {
  const counts = await withDb((db) =>
    db
      .select({
        releaseId: RecipeStepTable.releaseId,
        count: sql<number>`count(*)::int`,
      })
      .from(RecipeStepTable)
      .where(inArray(RecipeStepTable.releaseId, releaseIds))
      .groupBy(RecipeStepTable.releaseId),
  )

  const result = new Map<string, number>()
  for (const row of counts) {
    if (row.releaseId) {
      result.set(row.releaseId, row.count)
    }
  }
  return result
}

export async function listRecipeReleases(recipeId: string) {
  const organizationId = principal.orgId()

  return withDb((db) =>
    db
      .select({
        id: RecipeReleaseTable.id,
        recipeId: RecipeReleaseTable.recipeId,
        version: RecipeReleaseTable.version,
        versionMajor: RecipeReleaseTable.versionMajor,
        versionMinor: RecipeReleaseTable.versionMinor,
        versionPatch: RecipeReleaseTable.versionPatch,
        description: RecipeReleaseTable.description,
        configHash: RecipeReleaseTable.configHash,
        publishedAt: RecipeReleaseTable.publishedAt,
        createdAt: RecipeReleaseTable.createdAt,
        createdBy: {
          id: UserTable.id,
          name: UserTable.name,
          email: UserTable.email,
          image: UserTable.image,
        },
      })
      .from(RecipeReleaseTable)
      .innerJoin(RecipeTable, eq(RecipeReleaseTable.recipeId, RecipeTable.id))
      .leftJoin(UserTable, eq(RecipeReleaseTable.createdBy, UserTable.id))
      .where(and(eq(RecipeReleaseTable.recipeId, recipeId), eq(RecipeTable.organizationId, organizationId)))
      .orderBy(
        desc(RecipeReleaseTable.versionMajor),
        desc(RecipeReleaseTable.versionMinor),
        desc(RecipeReleaseTable.versionPatch),
        desc(RecipeReleaseTable.createdAt),
      ),
  )
}

export async function getRecipeRelease(recipeId: string, releaseId: string) {
  await getRecipeById(recipeId)

  const release = await withDb((db) =>
    db
      .select()
      .from(RecipeReleaseTable)
      .where(and(eq(RecipeReleaseTable.id, releaseId), eq(RecipeReleaseTable.recipeId, recipeId)))
      .then(first),
  )

  if (!release) throw createError("NotFoundError", { type: "RecipeRelease", id: releaseId })

  const rawSteps = await withDb((db) =>
    db.select().from(RecipeStepTable).where(eq(RecipeStepTable.releaseId, releaseId)),
  )

  const edges = await withDb((db) => db.select().from(RecipeEdgeTable).where(eq(RecipeEdgeTable.releaseId, releaseId)))

  const steps = orderStepsByEdgeChain(rawSteps, edges)

  return { ...release, steps, edges }
}

export const CreateRecipeExecutionSchema = z.object({
  recipeId: z.string(),
  releaseId: z.string().optional(),
  environmentId: z.string(),
  inputs: z.record(z.string(), z.unknown()),
})

export async function createRecipeExecution(raw: z.input<typeof CreateRecipeExecutionSchema>) {
  const input = CreateRecipeExecutionSchema.parse(raw)
  const organizationId = principal.orgId()
  const userId = principal.userId()

  const recipe = await getRecipeById(input.recipeId)
  const releaseId = input.releaseId ?? recipe.currentReleaseId
  if (!releaseId) {
    throw createError("BadRequestError", { message: "Recipe has no current release" })
  }

  const [execution] = await withDb((db) =>
    db
      .insert(RecipeExecutionTable)
      .values({
        recipeId: recipe.id,
        releaseId,
        organizationId,
        environmentId: input.environmentId,
        inputs: input.inputs,
        results: {},
        outputItemIds: [],
        createdBy: userId,
      })
      .returning(),
  )

  return execution
}

export const UpdateRecipeExecutionSchema = z.object({
  id: z.string(),
  currentStepKey: z.string().optional(),
  pendingInputConfig: PendingInputConfigSchema.optional().nullable(),
  results: z.record(z.string(), z.unknown()).optional(),
  outputItemIds: z.array(z.string()).optional(),
})

export async function updateRecipeExecution(raw: z.input<typeof UpdateRecipeExecutionSchema>) {
  const input = UpdateRecipeExecutionSchema.parse(raw)
  const organizationId = principal.orgId()

  const updateData: Record<string, unknown> = { updatedAt: new Date() }
  if (input.currentStepKey !== undefined) updateData.currentStepKey = input.currentStepKey
  if (input.pendingInputConfig !== undefined) updateData.pendingInputConfig = input.pendingInputConfig
  if (input.results !== undefined) updateData.results = input.results
  if (input.outputItemIds !== undefined) updateData.outputItemIds = input.outputItemIds

  const [updated] = await withDb((db) =>
    db
      .update(RecipeExecutionTable)
      .set(updateData)
      .where(and(eq(RecipeExecutionTable.id, input.id), eq(RecipeExecutionTable.organizationId, organizationId)))
      .returning(),
  )

  if (!updated) throw createError("NotFoundError", { type: "RecipeExecution", id: input.id })
  return updated
}

export async function deleteRecipeExecution(id: string) {
  const organizationId = principal.orgId()
  await withDb((db) =>
    db
      .delete(RecipeExecutionTable)
      .where(and(eq(RecipeExecutionTable.id, id), eq(RecipeExecutionTable.organizationId, organizationId))),
  )
}

export async function getRecipeExecutionById(id: string) {
  const organizationId = principal.orgId()
  const execution = await withDb((db) =>
    db
      .select()
      .from(RecipeExecutionTable)
      .where(and(eq(RecipeExecutionTable.id, id), eq(RecipeExecutionTable.organizationId, organizationId)))
      .then(first),
  )

  if (!execution) throw createError("NotFoundError", { type: "RecipeExecution", id })
  return execution
}

export async function findRecipeExecutionById(id: string) {
  const organizationId = principal.orgId()
  return withDb((db) =>
    db
      .select()
      .from(RecipeExecutionTable)
      .where(and(eq(RecipeExecutionTable.id, id), eq(RecipeExecutionTable.organizationId, organizationId)))
      .then(first),
  )
}

export async function findPendingExecution(recipeId: string) {
  const organizationId = principal.orgId()
  const userId = principal.userId()
  return withDb((db) =>
    db
      .select()
      .from(RecipeExecutionTable)
      .where(
        and(
          eq(RecipeExecutionTable.recipeId, recipeId),
          eq(RecipeExecutionTable.organizationId, organizationId),
          eq(RecipeExecutionTable.createdBy, userId),
        ),
      )
      .orderBy(desc(RecipeExecutionTable.createdAt))
      .limit(1)
      .then(first),
  )
}

export const ListRecipeExecutionsSchema = z
  .object({
    recipeId: z.string().optional(),
    createdBy: z.string().optional(),
    cursor: z.string().optional(),
    limit: z.number().min(1).max(100).optional(),
  })
  .optional()

export async function listRecipeExecutions(raw?: z.input<typeof ListRecipeExecutionsSchema>) {
  const filters = ListRecipeExecutionsSchema.parse(raw)
  const organizationId = principal.orgId()
  const limit = filters?.limit ?? 20

  const conditions = [eq(RecipeExecutionTable.organizationId, organizationId)]

  if (filters?.recipeId) {
    conditions.push(eq(RecipeExecutionTable.recipeId, filters.recipeId))
  }
  if (filters?.createdBy) {
    conditions.push(eq(RecipeExecutionTable.createdBy, filters.createdBy))
  }
  if (filters?.cursor) {
    const { date, id } = parseCursor(filters.cursor)
    conditions.push(
      or(
        lt(RecipeExecutionTable.createdAt, date),
        and(eq(RecipeExecutionTable.createdAt, date), lt(RecipeExecutionTable.id, id)),
      )!,
    )
  }

  const executions = await withDb((db) =>
    db
      .select()
      .from(RecipeExecutionTable)
      .where(and(...conditions))
      .orderBy(desc(RecipeExecutionTable.createdAt), desc(RecipeExecutionTable.id))
      .limit(limit + 1),
  )

  const hasMore = executions.length > limit
  const items = hasMore ? executions.slice(0, limit) : executions
  const nextCursor = hasMore ? `${items[items.length - 1].createdAt.toISOString()}_${items[items.length - 1].id}` : null

  return { items, nextCursor }
}

export const RespondToRecipeExecutionSchema = z.object({
  id: z.string(),
  response: z.record(z.string(), z.unknown()),
})

export async function respondToRecipeExecution(raw: z.input<typeof RespondToRecipeExecutionSchema>) {
  const input = RespondToRecipeExecutionSchema.parse(raw)
  const execution = await getRecipeExecutionById(input.id)

  if (!execution.pendingInputConfig) {
    throw createError("BadRequestError", { message: "Execution is not waiting for input" })
  }

  return { execution, response: input.response }
}

export const AddRecipeToChannelSchema = z.object({
  recipeId: z.string(),
  channelId: z.string(),
})

export async function addRecipeToChannel(raw: z.input<typeof AddRecipeToChannelSchema>) {
  const input = AddRecipeToChannelSchema.parse(raw)
  await getRecipeById(input.recipeId)
  const userId = principal.userId()

  try {
    const [channelRecipe] = await withDb((db) =>
      db
        .insert(ChannelRecipeTable)
        .values({
          recipeId: input.recipeId,
          channelId: input.channelId,
          createdBy: userId,
        })
        .returning(),
    )
    return channelRecipe
  } catch (err) {
    if (err instanceof Error && err.message.includes("channel_recipe_unique")) {
      throw createError("ConflictError", { message: "Recipe already assigned to this channel" })
    }
    throw err
  }
}

export const RemoveRecipeFromChannelSchema = z.object({
  recipeId: z.string(),
  channelId: z.string(),
})

export async function removeRecipeFromChannel(raw: z.input<typeof RemoveRecipeFromChannelSchema>) {
  const input = RemoveRecipeFromChannelSchema.parse(raw)
  await getRecipeById(input.recipeId)

  const [deleted] = await withDb((db) =>
    db
      .delete(ChannelRecipeTable)
      .where(and(eq(ChannelRecipeTable.recipeId, input.recipeId), eq(ChannelRecipeTable.channelId, input.channelId)))
      .returning({ id: ChannelRecipeTable.id }),
  )

  return deleted ?? null
}

export async function listRecipeChannels(recipeId: string) {
  await getRecipeById(recipeId)

  return withDb((db) => db.select().from(ChannelRecipeTable).where(eq(ChannelRecipeTable.recipeId, recipeId)))
}
