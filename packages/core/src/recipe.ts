import { z } from "zod"
import { eq, and, desc, lt, or } from "drizzle-orm"
import { principal } from "./principal"
import { withDb } from "./database"
import { RecipeTable, RecipeExecutionTable } from "./schema/recipe.sql"
import { createError } from "@synatra/util/error"
import {
  RecipeExecutionStatus,
  RecipeInputSchema,
  RecipeStepSchema,
  RecipeOutputSchema,
  PendingInputConfigSchema,
  type RecipeInput,
  type RecipeStep,
  type RecipeOutput,
  type PendingInputConfig,
} from "./types"

function first<T>(arr: T[]): T | undefined {
  return arr[0]
}

export const CreateRecipeSchema = z.object({
  agentId: z.string(),
  channelId: z.string().optional(),
  sourceThreadId: z.string().optional(),
  sourceRunId: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  inputs: z.array(RecipeInputSchema),
  steps: z.array(RecipeStepSchema),
  outputs: z.array(RecipeOutputSchema),
})

export async function createRecipe(raw: z.input<typeof CreateRecipeSchema>) {
  const input = CreateRecipeSchema.parse(raw)
  const organizationId = principal.orgId()
  const userId = principal.userId()

  const [recipe] = await withDb((db) =>
    db
      .insert(RecipeTable)
      .values({
        organizationId,
        agentId: input.agentId,
        channelId: input.channelId,
        sourceThreadId: input.sourceThreadId,
        sourceRunId: input.sourceRunId,
        name: input.name,
        description: input.description,
        inputs: input.inputs,
        steps: input.steps,
        outputs: input.outputs,
        createdBy: userId,
      })
      .returning(),
  )

  return recipe
}

export const UpdateRecipeSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  inputs: z.array(RecipeInputSchema).optional(),
  steps: z.array(RecipeStepSchema).optional(),
  outputs: z.array(RecipeOutputSchema).optional(),
})

export async function updateRecipe(raw: z.input<typeof UpdateRecipeSchema>) {
  const input = UpdateRecipeSchema.parse(raw)
  const organizationId = principal.orgId()

  const updateData: Record<string, unknown> = { updatedAt: new Date() }
  if (input.name !== undefined) updateData.name = input.name
  if (input.description !== undefined) updateData.description = input.description
  if (input.inputs !== undefined) updateData.inputs = input.inputs
  if (input.steps !== undefined) updateData.steps = input.steps
  if (input.outputs !== undefined) updateData.outputs = input.outputs

  const [updated] = await withDb((db) =>
    db
      .update(RecipeTable)
      .set(updateData)
      .where(and(eq(RecipeTable.id, input.id), eq(RecipeTable.organizationId, organizationId)))
      .returning(),
  )

  if (!updated) throw createError("NotFoundError", { type: "Recipe", id: input.id })
  return updated
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
  return recipe
}

export async function findRecipeById(id: string) {
  const organizationId = principal.orgId()
  return withDb((db) =>
    db
      .select()
      .from(RecipeTable)
      .where(and(eq(RecipeTable.id, id), eq(RecipeTable.organizationId, organizationId)))
      .then(first),
  )
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

  const conditions = [eq(RecipeTable.organizationId, organizationId)]

  if (filters?.agentId) {
    conditions.push(eq(RecipeTable.agentId, filters.agentId))
  }
  if (filters?.channelId) {
    conditions.push(eq(RecipeTable.channelId, filters.channelId))
  }
  if (filters?.cursor) {
    const [cursorDate, cursorId] = filters.cursor.split("_")
    conditions.push(
      or(
        lt(RecipeTable.createdAt, new Date(cursorDate)),
        and(eq(RecipeTable.createdAt, new Date(cursorDate)), lt(RecipeTable.id, cursorId)),
      )!,
    )
  }

  const recipes = await withDb((db) =>
    db
      .select()
      .from(RecipeTable)
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

export const CreateRecipeExecutionSchema = z.object({
  recipeId: z.string(),
  environmentId: z.string(),
  inputs: z.record(z.string(), z.unknown()),
})

export async function createRecipeExecution(raw: z.input<typeof CreateRecipeExecutionSchema>) {
  const input = CreateRecipeExecutionSchema.parse(raw)
  const organizationId = principal.orgId()
  const userId = principal.userId()

  const recipe = await getRecipeById(input.recipeId)

  const [execution] = await withDb((db) =>
    db
      .insert(RecipeExecutionTable)
      .values({
        recipeId: recipe.id,
        organizationId,
        environmentId: input.environmentId,
        inputs: input.inputs,
        status: "pending",
        results: {},
        resolvedParams: {},
        outputItemIds: [],
        createdBy: userId,
      })
      .returning(),
  )

  return execution
}

export const UpdateRecipeExecutionSchema = z.object({
  id: z.string(),
  status: z.enum(RecipeExecutionStatus).optional(),
  currentStepId: z.string().optional(),
  pendingInputConfig: PendingInputConfigSchema.optional().nullable(),
  results: z.record(z.string(), z.unknown()).optional(),
  resolvedParams: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  outputItemIds: z.array(z.string()).optional(),
  error: z.string().optional(),
})

export async function updateRecipeExecution(raw: z.input<typeof UpdateRecipeExecutionSchema>) {
  const input = UpdateRecipeExecutionSchema.parse(raw)
  const organizationId = principal.orgId()

  const updateData: Record<string, unknown> = { updatedAt: new Date() }
  if (input.status !== undefined) {
    updateData.status = input.status
    if (input.status === "completed" || input.status === "failed") {
      updateData.completedAt = new Date()
    }
  }
  if (input.currentStepId !== undefined) updateData.currentStepId = input.currentStepId
  if (input.pendingInputConfig !== undefined) updateData.pendingInputConfig = input.pendingInputConfig
  if (input.results !== undefined) updateData.results = input.results
  if (input.resolvedParams !== undefined) updateData.resolvedParams = input.resolvedParams
  if (input.outputItemIds !== undefined) updateData.outputItemIds = input.outputItemIds
  if (input.error !== undefined) updateData.error = input.error

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

export const ListRecipeExecutionsSchema = z
  .object({
    recipeId: z.string().optional(),
    status: z.enum(RecipeExecutionStatus).optional(),
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
  if (filters?.status) {
    conditions.push(eq(RecipeExecutionTable.status, filters.status))
  }
  if (filters?.cursor) {
    const [cursorDate, cursorId] = filters.cursor.split("_")
    conditions.push(
      or(
        lt(RecipeExecutionTable.createdAt, new Date(cursorDate)),
        and(eq(RecipeExecutionTable.createdAt, new Date(cursorDate)), lt(RecipeExecutionTable.id, cursorId)),
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

  if (execution.status !== "waiting_input") {
    throw createError("BadRequestError", { message: "Execution is not waiting for input" })
  }

  return { execution, response: input.response }
}
