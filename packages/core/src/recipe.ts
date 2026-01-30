import { z } from "zod"
import { eq, and, desc, lt, or, getTableColumns, sql, inArray, isNull } from "drizzle-orm"
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
  RecipeStepType,
  ToolStepConfigSchema,
  type RecipeInput,
  type RecipeOutput,
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

async function canAccessRecipeChannel(channelId: string | null): Promise<boolean> {
  if (!channelId) return true
  const accessibleChannels = await getAccessibleChannelIds()
  if (accessibleChannels === null) return true
  return accessibleChannels.includes(channelId)
}

export const CreateRecipeSchema = z.object({
  agentId: z.string(),
  channelId: z.string().optional(),
  sourceThreadId: z.string().optional(),
  sourceRunId: z.string().optional(),
  name: z.string().min(1),
  slug: z.string().optional(),
  description: z.string().optional(),
  agentReleaseId: z.string().nullable().optional(),
  agentVersionMode: z.enum(["current", "fixed"]).default("current"),
  inputs: z.array(RecipeInputSchema),
  outputs: z.array(RecipeOutputSchema),
  steps: z.array(
    z.object({
      stepKey: z.string(),
      label: z.string(),
      type: z.enum(RecipeStepType).default("tool"),
      config: ToolStepConfigSchema,
      dependsOn: z.array(z.string()),
    }),
  ),
})

export async function createRecipe(raw: z.input<typeof CreateRecipeSchema>) {
  const input = CreateRecipeSchema.parse(raw)
  const organizationId = principal.orgId()
  const userId = principal.userId()
  const slug = input.slug || generateSlug(input.name) || generateRandomId()

  if (isReservedSlug(slug)) {
    throw createError("BadRequestError", { message: `Slug "${slug}" is reserved` })
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
          agentId: input.agentId,
          channelId: input.channelId,
          sourceThreadId: input.sourceThreadId,
          sourceRunId: input.sourceRunId,
          name: input.name,
          slug,
          description: input.description,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning()

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
          input.steps.map((step, idx) => ({
            releaseId: release.id,
            stepKey: step.stepKey,
            label: step.label,
            type: step.type,
            config: step.config,
            position: idx,
          })),
        )

        await db.insert(RecipeStepTable).values(
          input.steps.map((step, idx) => ({
            workingCopyRecipeId: recipe.id,
            stepKey: step.stepKey,
            label: step.label,
            type: step.type,
            config: step.config,
            position: idx,
          })),
        )

        const edges: Array<{
          releaseId?: string
          workingCopyRecipeId?: string
          fromStepKey: string
          toStepKey: string
        }> = []
        for (const step of input.steps) {
          for (const depKey of step.dependsOn) {
            edges.push({ releaseId: release.id, fromStepKey: depKey, toStepKey: step.stepKey })
            edges.push({ workingCopyRecipeId: recipe.id, fromStepKey: depKey, toStepKey: step.stepKey })
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

  if (!(await canAccessRecipeChannel(recipe.channelId))) {
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

  if (!(await canAccessRecipeChannel(recipe.channelId))) {
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

  if (accessibleChannels !== null) {
    if (accessibleChannels.length === 0) {
      conditions.push(isNull(RecipeTable.channelId))
    } else {
      conditions.push(or(isNull(RecipeTable.channelId), inArray(RecipeTable.channelId, accessibleChannels))!)
    }
  }
  if (filters?.agentId) {
    conditions.push(eq(RecipeTable.agentId, filters.agentId))
  }
  if (filters?.channelId) {
    if (accessibleChannels !== null && !accessibleChannels.includes(filters.channelId)) {
      return { items: [], nextCursor: null }
    }
    conditions.push(eq(RecipeTable.channelId, filters.channelId))
  }
  if (filters?.cursor) {
    const { date, id } = parseCursor(filters.cursor)
    conditions.push(or(lt(RecipeTable.createdAt, date), and(eq(RecipeTable.createdAt, date), lt(RecipeTable.id, id)))!)
  }

  const recipes = await withDb((db) =>
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
      .limit(limit + 1),
  )

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
  steps: z
    .array(
      z.object({
        stepKey: z.string(),
        label: z.string(),
        type: z.enum(RecipeStepType).default("tool"),
        config: ToolStepConfigSchema,
        dependsOn: z.array(z.string()),
      }),
    )
    .optional(),
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
          input.steps.map((step, idx) => ({
            workingCopyRecipeId: input.recipeId,
            stepKey: step.stepKey,
            label: step.label,
            type: step.type,
            config: step.config,
            position: idx,
          })),
        )

        const edges: Array<{ workingCopyRecipeId: string; fromStepKey: string; toStepKey: string }> = []
        for (const step of input.steps) {
          for (const depKey of step.dependsOn) {
            edges.push({ workingCopyRecipeId: input.recipeId, fromStepKey: depKey, toStepKey: step.stepKey })
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

  const steps = await withDb((db) =>
    db
      .select()
      .from(RecipeStepTable)
      .where(eq(RecipeStepTable.workingCopyRecipeId, recipeId))
      .orderBy(RecipeStepTable.position),
  )

  const edges = await withDb((db) =>
    db.select().from(RecipeEdgeTable).where(eq(RecipeEdgeTable.workingCopyRecipeId, recipeId)),
  )

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
      .orderBy(RecipeStepTable.position)

    if (workingSteps.length > 0) {
      await db.insert(RecipeStepTable).values(
        workingSteps.map((step) => ({
          releaseId: created.id,
          stepKey: step.stepKey,
          label: step.label,
          type: step.type,
          config: step.config,
          position: step.position,
        })),
      )
    }

    const workingEdges = await db
      .select()
      .from(RecipeEdgeTable)
      .where(eq(RecipeEdgeTable.workingCopyRecipeId, input.recipeId))

    if (workingEdges.length > 0) {
      await db.insert(RecipeEdgeTable).values(
        workingEdges.map((edge) => ({
          releaseId: created.id,
          fromStepKey: edge.fromStepKey,
          toStepKey: edge.toStepKey,
        })),
      )
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
      .orderBy(RecipeStepTable.position)

    if (releaseSteps.length > 0) {
      await db.insert(RecipeStepTable).values(
        releaseSteps.map((step) => ({
          workingCopyRecipeId: input.recipeId,
          stepKey: step.stepKey,
          label: step.label,
          type: step.type,
          config: step.config,
          position: step.position,
        })),
      )
    }

    const releaseEdges = await db.select().from(RecipeEdgeTable).where(eq(RecipeEdgeTable.releaseId, input.releaseId))

    if (releaseEdges.length > 0) {
      await db.insert(RecipeEdgeTable).values(
        releaseEdges.map((edge) => ({
          workingCopyRecipeId: input.recipeId,
          fromStepKey: edge.fromStepKey,
          toStepKey: edge.toStepKey,
        })),
      )
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

  const steps = await withDb((db) =>
    db.select().from(RecipeStepTable).where(eq(RecipeStepTable.releaseId, releaseId)).orderBy(RecipeStepTable.position),
  )

  const edges = await withDb((db) => db.select().from(RecipeEdgeTable).where(eq(RecipeEdgeTable.releaseId, releaseId)))

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
