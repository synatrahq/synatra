import { z } from "zod"
import { and, eq, desc, getTableColumns } from "drizzle-orm"
import { createHash } from "crypto"
import { principal } from "./principal"
import { withDb, withTx, first } from "./database"
import { PromptTable, PromptReleaseTable, PromptWorkingCopyTable } from "./schema/prompt.sql"
import { AgentTable, AgentReleaseTable } from "./schema/agent.sql"
import { UserTable } from "./schema/user.sql"
import { normalizeInputSchema, serializeConfig } from "@synatra/util/normalize"
import type { PromptMode } from "./types"
import { createError } from "@synatra/util/error"
import { generateSlug, generateRandomId, isReservedSlug } from "@synatra/util/identifier"
import { parseVersion, stringifyVersion, bumpVersion } from "@synatra/util/version"

function hashContent(mode: PromptMode, content: string, script: string | null, inputSchema: unknown): string {
  return createHash("sha256")
    .update(serializeConfig({ mode, content, script, inputSchema: normalizeInputSchema(inputSchema) }))
    .digest("hex")
}

async function loadRelease(promptId: string, releaseId: string) {
  const organizationId = principal.orgId()
  return withDb((db) =>
    db
      .select(getTableColumns(PromptReleaseTable))
      .from(PromptReleaseTable)
      .innerJoin(PromptTable, eq(PromptReleaseTable.promptId, PromptTable.id))
      .where(
        and(
          eq(PromptReleaseTable.id, releaseId),
          eq(PromptTable.id, promptId),
          eq(PromptTable.organizationId, organizationId),
        ),
      )
      .then(first),
  )
}

const releaseColumns = {
  version: PromptReleaseTable.version,
  mode: PromptReleaseTable.mode,
  content: PromptReleaseTable.content,
  script: PromptReleaseTable.script,
  inputSchema: PromptReleaseTable.inputSchema,
  contentHash: PromptReleaseTable.contentHash,
}

export const ListPromptsSchema = z.void().optional()

export const CreatePromptSchema = z.object({
  agentId: z.string(),
  name: z.string().min(1),
  slug: z.string().optional(),
  description: z.string().optional(),
  mode: z.enum(["template", "script"]).default("template"),
  content: z.string().optional(),
  script: z.string().optional(),
  inputSchema: z.unknown().optional(),
  initialVersion: z.string().optional(),
  descriptionText: z.string().optional(),
})

export const UpdatePromptSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  description: z.string().optional(),
})

export const SavePromptWorkingCopySchema = z.object({
  promptId: z.string(),
  mode: z.enum(["template", "script"]).optional(),
  content: z.string().optional(),
  script: z.string().optional(),
  inputSchema: z.unknown().optional(),
})

export const DeployPromptSchema = z.object({
  promptId: z.string(),
  version: z.string().optional(),
  bump: z.enum(["major", "minor", "patch"]).optional(),
  description: z.string().default(""),
})

export const AdoptPromptSchema = z.object({ promptId: z.string(), releaseId: z.string() })

export const CheckoutPromptSchema = z.object({ promptId: z.string(), releaseId: z.string() })

export const FindPromptByReleaseSchema = z.object({ promptId: z.string(), releaseId: z.string() })

export async function listPrompts(input?: z.input<typeof ListPromptsSchema>) {
  ListPromptsSchema.parse(input)
  const organizationId = principal.orgId()
  return withDb((db) =>
    db
      .select({
        id: PromptTable.id,
        agentId: PromptTable.agentId,
        name: PromptTable.name,
        slug: PromptTable.slug,
        description: PromptTable.description,
        mode: PromptReleaseTable.mode,
        content: PromptReleaseTable.content,
        script: PromptReleaseTable.script,
        inputSchema: PromptReleaseTable.inputSchema,
        createdAt: PromptTable.createdAt,
        updatedAt: PromptTable.updatedAt,
        currentReleaseId: PromptTable.currentReleaseId,
        version: PromptReleaseTable.version,
        contentHash: PromptReleaseTable.contentHash,
        agent: {
          id: AgentTable.id,
          name: AgentTable.name,
          slug: AgentTable.slug,
          icon: AgentTable.icon,
          iconColor: AgentTable.iconColor,
        },
      })
      .from(PromptTable)
      .innerJoin(AgentTable, eq(PromptTable.agentId, AgentTable.id))
      .leftJoin(PromptReleaseTable, eq(PromptTable.currentReleaseId, PromptReleaseTable.id))
      .where(eq(PromptTable.organizationId, organizationId)),
  )
}

export async function listPromptsByAgent(agentId: string) {
  const organizationId = principal.orgId()
  return withDb((db) =>
    db
      .select({
        ...getTableColumns(PromptTable),
        version: PromptReleaseTable.version,
        mode: PromptReleaseTable.mode,
        content: PromptReleaseTable.content,
        script: PromptReleaseTable.script,
        inputSchema: PromptReleaseTable.inputSchema,
        contentHash: PromptReleaseTable.contentHash,
      })
      .from(PromptTable)
      .leftJoin(PromptReleaseTable, eq(PromptTable.currentReleaseId, PromptReleaseTable.id))
      .where(and(eq(PromptTable.agentId, agentId), eq(PromptTable.organizationId, organizationId))),
  )
}

export async function findPromptById(id: string) {
  const organizationId = principal.orgId()
  return withDb((db) =>
    db
      .select({ ...getTableColumns(PromptTable), ...releaseColumns })
      .from(PromptTable)
      .leftJoin(PromptReleaseTable, eq(PromptTable.currentReleaseId, PromptReleaseTable.id))
      .where(and(eq(PromptTable.id, id), eq(PromptTable.organizationId, organizationId)))
      .then(first),
  )
}

export async function getPromptById(id: string) {
  const prompt = await findPromptById(id)
  if (!prompt) throw createError("NotFoundError", { type: "Prompt", id })
  return prompt
}

export async function getPromptByIdWithAgent(id: string) {
  const organizationId = principal.orgId()
  const result = await withDb((db) =>
    db
      .select({
        id: PromptTable.id,
        organizationId: PromptTable.organizationId,
        agentId: PromptTable.agentId,
        name: PromptTable.name,
        slug: PromptTable.slug,
        description: PromptTable.description,
        mode: PromptReleaseTable.mode,
        content: PromptReleaseTable.content,
        script: PromptReleaseTable.script,
        inputSchema: PromptReleaseTable.inputSchema,
        createdBy: PromptTable.createdBy,
        updatedBy: PromptTable.updatedBy,
        createdAt: PromptTable.createdAt,
        updatedAt: PromptTable.updatedAt,
        currentReleaseId: PromptTable.currentReleaseId,
        version: PromptReleaseTable.version,
        contentHash: PromptReleaseTable.contentHash,
        agent: {
          id: AgentTable.id,
          name: AgentTable.name,
          slug: AgentTable.slug,
          icon: AgentTable.icon,
          iconColor: AgentTable.iconColor,
          description: AgentTable.description,
          runtimeConfig: AgentReleaseTable.runtimeConfig,
        },
      })
      .from(PromptTable)
      .innerJoin(AgentTable, eq(PromptTable.agentId, AgentTable.id))
      .leftJoin(PromptReleaseTable, eq(PromptTable.currentReleaseId, PromptReleaseTable.id))
      .leftJoin(AgentReleaseTable, eq(AgentTable.currentReleaseId, AgentReleaseTable.id))
      .where(and(eq(PromptTable.id, id), eq(PromptTable.organizationId, organizationId))),
  )
  if (!result[0]) throw createError("NotFoundError", { type: "Prompt", id })
  return result[0]
}

export async function createPrompt(input: z.input<typeof CreatePromptSchema>) {
  const data = CreatePromptSchema.parse(input)
  const mode = data.mode ?? "template"
  const content = data.content ?? ""
  const script = data.script ?? ""

  const organizationId = principal.orgId()
  const userId = principal.userId()
  const slug = data.slug?.trim() || generateSlug(data.name) || generateRandomId()
  if (isReservedSlug(slug)) {
    throw createError("BadRequestError", { message: `Slug "${slug}" is reserved` })
  }
  const versionParsed = parseVersion(data.initialVersion ?? "0.0.1")
  const versionText = stringifyVersion(versionParsed)
  const contentHashValue = hashContent(mode, content, script, data.inputSchema)

  const promptId = await withTx(async (db) => {
    const [prompt] = await db
      .insert(PromptTable)
      .values({
        organizationId,
        agentId: data.agentId,
        name: data.name,
        slug,
        description: data.description ?? null,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning()

    const [release] = await db
      .insert(PromptReleaseTable)
      .values({
        promptId: prompt.id,
        version: versionText,
        versionMajor: versionParsed.major,
        versionMinor: versionParsed.minor,
        versionPatch: versionParsed.patch,
        description: data.descriptionText ?? "Initial release",
        mode,
        content,
        script,
        inputSchema: data.inputSchema ?? null,
        contentHash: contentHashValue,
        publishedAt: new Date(),
        createdBy: userId,
      })
      .returning()

    await db.insert(PromptWorkingCopyTable).values({
      promptId: prompt.id,
      mode,
      content,
      script,
      inputSchema: data.inputSchema ?? null,
      contentHash: contentHashValue,
      updatedBy: userId,
    })

    await db
      .update(PromptTable)
      .set({ currentReleaseId: release.id, updatedBy: userId, updatedAt: new Date() })
      .where(eq(PromptTable.id, prompt.id))

    return prompt.id
  })

  return findPromptById(promptId)
}

export async function updatePrompt(input: z.input<typeof UpdatePromptSchema>) {
  const data = UpdatePromptSchema.parse(input)
  if (data.slug !== undefined && isReservedSlug(data.slug)) {
    throw createError("BadRequestError", { message: `Slug "${data.slug}" is reserved` })
  }
  await getPromptById(data.id)
  if (data.name === undefined && data.slug === undefined && data.description === undefined)
    return findPromptById(data.id)

  await withDb((db) =>
    db
      .update(PromptTable)
      .set({
        updatedAt: new Date(),
        updatedBy: principal.userId(),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.description !== undefined && { description: data.description }),
      })
      .where(eq(PromptTable.id, data.id)),
  )
  return findPromptById(data.id)
}

export async function savePromptWorkingCopy(input: z.input<typeof SavePromptWorkingCopySchema>) {
  const data = SavePromptWorkingCopySchema.parse(input)
  const current = await getPromptById(data.promptId)
  const mode = data.mode ?? (current.mode as "template" | "script") ?? "template"
  const content = data.content ?? current.content ?? ""
  const script = data.script ?? current.script ?? ""
  const contentHashValue = hashContent(mode, content, script, data.inputSchema)
  const userId = principal.userId()

  await withDb((db) =>
    db
      .insert(PromptWorkingCopyTable)
      .values({
        promptId: data.promptId,
        mode,
        content,
        script,
        inputSchema: data.inputSchema ?? null,
        contentHash: contentHashValue,
        updatedBy: userId,
      })
      .onConflictDoUpdate({
        target: PromptWorkingCopyTable.promptId,
        set: {
          mode,
          content,
          script,
          inputSchema: data.inputSchema ?? null,
          contentHash: contentHashValue,
          updatedBy: userId,
          updatedAt: new Date(),
        },
      }),
  )

  return { promptId: data.promptId, contentHash: contentHashValue }
}

export async function getPromptWorkingCopy(promptId: string) {
  await getPromptById(promptId)
  return withDb((db) =>
    db
      .select(getTableColumns(PromptWorkingCopyTable))
      .from(PromptWorkingCopyTable)
      .where(eq(PromptWorkingCopyTable.promptId, promptId))
      .then(first),
  )
}

export async function deployPrompt(input: z.input<typeof DeployPromptSchema>) {
  const data = DeployPromptSchema.parse(input)
  await getPromptById(data.promptId)
  const working = await withDb((db) =>
    db
      .select({
        promptId: PromptWorkingCopyTable.promptId,
        mode: PromptWorkingCopyTable.mode,
        content: PromptWorkingCopyTable.content,
        script: PromptWorkingCopyTable.script,
        inputSchema: PromptWorkingCopyTable.inputSchema,
        contentHash: PromptWorkingCopyTable.contentHash,
      })
      .from(PromptWorkingCopyTable)
      .where(eq(PromptWorkingCopyTable.promptId, data.promptId))
      .then(first),
  )
  if (!working) throw new Error("Working copy not found")
  if (data.version && data.bump) throw new Error("Specify either version or bump, not both")

  const userId = principal.userId()
  const [release] = await withTx(async (db) => {
    const latest = await db
      .select({
        major: PromptReleaseTable.versionMajor,
        minor: PromptReleaseTable.versionMinor,
        patch: PromptReleaseTable.versionPatch,
      })
      .from(PromptReleaseTable)
      .where(eq(PromptReleaseTable.promptId, data.promptId))
      .orderBy(
        desc(PromptReleaseTable.versionMajor),
        desc(PromptReleaseTable.versionMinor),
        desc(PromptReleaseTable.versionPatch),
      )
      .limit(1)
      .then(first)
    const target = data.version ? parseVersion(data.version) : bumpVersion(latest ?? null, data.bump ?? "patch")

    const [created] = await db
      .insert(PromptReleaseTable)
      .values({
        promptId: data.promptId,
        version: stringifyVersion(target),
        versionMajor: target.major,
        versionMinor: target.minor,
        versionPatch: target.patch,
        description: data.description,
        mode: working.mode,
        content: working.content,
        script: working.script,
        inputSchema: working.inputSchema,
        contentHash: working.contentHash,
        publishedAt: new Date(),
        createdBy: userId,
      })
      .returning()

    await db
      .update(PromptTable)
      .set({ currentReleaseId: created.id, updatedAt: new Date(), updatedBy: userId })
      .where(eq(PromptTable.id, data.promptId))
    await db
      .update(PromptWorkingCopyTable)
      .set({ updatedAt: new Date(), updatedBy: userId })
      .where(eq(PromptWorkingCopyTable.promptId, data.promptId))
    return [created]
  })
  return release
}

export async function adoptPrompt(input: z.input<typeof AdoptPromptSchema>) {
  const data = AdoptPromptSchema.parse(input)
  const release = await loadRelease(data.promptId, data.releaseId)
  if (!release) throw new Error("Release not found")
  const userId = principal.userId()
  await withDb((db) =>
    db
      .update(PromptTable)
      .set({ currentReleaseId: release.id, updatedAt: new Date(), updatedBy: userId })
      .where(eq(PromptTable.id, data.promptId)),
  )
  return release
}

export async function checkoutPrompt(input: z.input<typeof CheckoutPromptSchema>) {
  const data = CheckoutPromptSchema.parse(input)
  const release = await loadRelease(data.promptId, data.releaseId)
  if (!release) throw new Error("Release not found")
  const userId = principal.userId()

  await withDb((db) =>
    db
      .insert(PromptWorkingCopyTable)
      .values({
        promptId: data.promptId,
        mode: release.mode,
        content: release.content,
        script: release.script,
        inputSchema: release.inputSchema,
        contentHash: release.contentHash,
        updatedBy: userId,
      })
      .onConflictDoUpdate({
        target: PromptWorkingCopyTable.promptId,
        set: {
          mode: release.mode,
          content: release.content,
          script: release.script,
          inputSchema: release.inputSchema,
          contentHash: release.contentHash,
          updatedBy: userId,
          updatedAt: new Date(),
        },
      }),
  )
  return { promptId: data.promptId, releaseId: data.releaseId }
}

export async function listPromptReleases(promptId: string) {
  const organizationId = principal.orgId()
  return withDb((db) =>
    db
      .select({
        ...getTableColumns(PromptReleaseTable),
        createdBy: { id: UserTable.id, name: UserTable.name, email: UserTable.email, image: UserTable.image },
      })
      .from(PromptReleaseTable)
      .innerJoin(PromptTable, eq(PromptReleaseTable.promptId, PromptTable.id))
      .innerJoin(UserTable, eq(PromptReleaseTable.createdBy, UserTable.id))
      .where(and(eq(PromptReleaseTable.promptId, promptId), eq(PromptTable.organizationId, organizationId)))
      .orderBy(
        desc(PromptReleaseTable.versionMajor),
        desc(PromptReleaseTable.versionMinor),
        desc(PromptReleaseTable.versionPatch),
        desc(PromptReleaseTable.createdAt),
      ),
  )
}

export async function findPromptByRelease(input: z.input<typeof FindPromptByReleaseSchema>) {
  const data = FindPromptByReleaseSchema.parse(input)
  const release = await loadRelease(data.promptId, data.releaseId)
  if (!release) return null
  return {
    id: release.id,
    promptId: release.promptId,
    version: release.version,
    mode: release.mode,
    content: release.content,
    script: release.script,
    inputSchema: release.inputSchema,
    contentHash: release.contentHash,
  }
}

export async function removePrompt(id: string) {
  await getPromptById(id)
  const [deleted] = await withDb((db) =>
    db.delete(PromptTable).where(eq(PromptTable.id, id)).returning({ id: PromptTable.id }),
  )
  return deleted
}
