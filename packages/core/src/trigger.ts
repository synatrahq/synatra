import { z } from "zod"
import { eq, and, sql, desc, getTableColumns } from "drizzle-orm"
import { randomBytes, createHash } from "crypto"
import { principal } from "./principal"
import { withDb, withTx, first } from "./database"
import { generateSlug, generateRandomId, isReservedSlug } from "@synatra/util/identifier"
import {
  TriggerTable,
  TriggerReleaseTable,
  TriggerWorkingCopyTable,
  TriggerEnvironmentTable,
  versionModeEnum,
  triggerModeEnum,
  triggerTypeEnum,
} from "./schema/trigger.sql"
import { AgentTable } from "./schema/agent.sql"
import { AppAccountTable } from "./schema/app-account.sql"
import { ChannelTable } from "./schema/channel.sql"
import { EnvironmentTable } from "./schema/environment.sql"
import { UserTable } from "./schema/user.sql"
import { findPromptByRelease, findPromptById, getPromptById } from "./prompt"
import { normalizeInputSchema, serializeConfig } from "@synatra/util/normalize"
import { createError } from "@synatra/util/error"
import { bumpVersion, parseVersion, stringifyVersion } from "@synatra/util/version"

const VALID_TIMEZONES = ["UTC", ...Intl.supportedValuesOf("timeZone")]

function generateSecret(): string {
  return randomBytes(32).toString("hex")
}

function hashConfig(config: Record<string, unknown>): string {
  const normalized = { ...config, payloadSchema: normalizeInputSchema(config.payloadSchema) }
  return createHash("sha256").update(serializeConfig(normalized)).digest("hex")
}

function isBlank(value: string | null | undefined) {
  return !value || !value.trim()
}

async function loadRelease(triggerId: string, releaseId: string) {
  const organizationId = principal.orgId()
  return withDb((db) =>
    db
      .select(getTableColumns(TriggerReleaseTable))
      .from(TriggerReleaseTable)
      .innerJoin(TriggerTable, eq(TriggerReleaseTable.triggerId, TriggerTable.id))
      .where(
        and(
          eq(TriggerReleaseTable.id, releaseId),
          eq(TriggerTable.id, triggerId),
          eq(TriggerTable.organizationId, organizationId),
        ),
      )
      .then(first),
  )
}

const INVALID_CONFIG = { ok: false as const, message: "Trigger has no valid prompt configuration" }

function hasContent(mode: string | null, content: string | null, script: string | null) {
  return mode === "script" ? !isBlank(script) : !isBlank(content)
}

const releaseColumns = {
  version: TriggerReleaseTable.version,
  agentReleaseId: TriggerReleaseTable.agentReleaseId,
  agentVersionMode: TriggerReleaseTable.agentVersionMode,
  promptId: TriggerReleaseTable.promptId,
  promptReleaseId: TriggerReleaseTable.promptReleaseId,
  promptVersionMode: TriggerReleaseTable.promptVersionMode,
  mode: TriggerReleaseTable.mode,
  template: TriggerReleaseTable.template,
  script: TriggerReleaseTable.script,
  payloadSchema: TriggerReleaseTable.payloadSchema,
  type: TriggerReleaseTable.type,
  cron: TriggerReleaseTable.cron,
  timezone: TriggerReleaseTable.timezone,
  input: TriggerReleaseTable.input,
  appAccountId: TriggerReleaseTable.appAccountId,
  appEvents: TriggerReleaseTable.appEvents,
  configHash: TriggerReleaseTable.configHash,
}

export const ValidateTriggerPromptConfigSchema = z.object({
  mode: z.enum(triggerModeEnum.enumValues).nullable(),
  template: z.string().nullable(),
  script: z.string().nullable(),
  promptId: z.string().nullable(),
  promptReleaseId: z.string().nullable(),
  promptVersionMode: z.enum(versionModeEnum.enumValues).nullable(),
})

export const ListTriggersSchema = z.void().optional()

export const CreateTriggerSchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  initialVersion: z.string().optional(),
  description: z.string().optional(),
  agentId: z.string(),
  agentReleaseId: z.string().nullable().optional(),
  agentVersionMode: z.enum(versionModeEnum.enumValues).default("current"),
  promptId: z.string().nullable().optional(),
  promptReleaseId: z.string().nullable().optional(),
  promptVersionMode: z.enum(versionModeEnum.enumValues).default("current"),
  mode: z.enum(triggerModeEnum.enumValues).default("template"),
  template: z.string().nullable().optional(),
  script: z.string().nullable().optional(),
  payloadSchema: z.unknown().nullable().optional(),
  type: z.enum(triggerTypeEnum.enumValues).default("schedule"),
  cron: z.string().nullable().optional(),
  timezone: z
    .string()
    .refine((tz) => VALID_TIMEZONES.includes(tz), { message: "Invalid timezone" })
    .default("UTC"),
  input: z.record(z.string(), z.unknown()).nullable().optional(),
  appAccountId: z.string().nullable().optional(),
  appEvents: z.array(z.string()).nullable().optional(),
})

export const UpdateTriggerSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
})

export const SaveTriggerWorkingCopySchema = z.object({
  triggerId: z.string(),
  agentReleaseId: z.string().nullable().optional(),
  agentVersionMode: z.enum(versionModeEnum.enumValues).optional(),
  promptId: z.string().nullable().optional(),
  promptReleaseId: z.string().nullable().optional(),
  promptVersionMode: z.enum(versionModeEnum.enumValues).optional(),
  mode: z.enum(triggerModeEnum.enumValues).optional(),
  template: z.string().nullable().optional(),
  script: z.string().nullable().optional(),
  payloadSchema: z.unknown().nullable().optional(),
  type: z.enum(triggerTypeEnum.enumValues).optional(),
  cron: z.string().nullable().optional(),
  timezone: z
    .string()
    .refine((tz) => VALID_TIMEZONES.includes(tz), { message: "Invalid timezone" })
    .optional(),
  input: z.record(z.string(), z.unknown()).nullable().optional(),
  appAccountId: z.string().nullable().optional(),
  appEvents: z.array(z.string()).nullable().optional(),
})

export const DeployTriggerSchema = z.object({
  triggerId: z.string(),
  version: z.string().optional(),
  bump: z.enum(["major", "minor", "patch"]).optional(),
  description: z.string().default(""),
})

export const AdoptTriggerSchema = z.object({ triggerId: z.string(), releaseId: z.string() })

export const CheckoutTriggerSchema = z.object({ triggerId: z.string(), releaseId: z.string() })

export const AddTriggerEnvironmentSchema = z.object({
  triggerId: z.string(),
  environmentId: z.string(),
  channelId: z.string(),
})

export const RemoveTriggerEnvironmentSchema = z.object({ triggerId: z.string(), environmentId: z.string() })

export const UpdateTriggerEnvironmentSchema = z.object({
  triggerId: z.string(),
  environmentId: z.string(),
  channelId: z.string().optional(),
})

export const ToggleTriggerEnvironmentSchema = z.object({ triggerId: z.string(), environmentId: z.string() })

export const RegenerateTriggerWebhookSecretSchema = z.object({ triggerId: z.string(), environmentId: z.string() })

export const RegenerateTriggerDebugSecretSchema = z.object({ triggerId: z.string(), environmentId: z.string() })

export const ListActiveTriggersByAppAccountAndEventSchema = z.object({
  appAccountId: z.string(),
  eventType: z.string(),
})

export const FindTriggerByWebhookPathSchema = z.object({
  orgSlug: z.string(),
  envSlug: z.string(),
  triggerSlug: z.string(),
})

export const FindTriggerByRunPathSchema = z.object({
  orgSlug: z.string(),
  envSlug: z.string(),
  triggerSlug: z.string(),
  version: z.string(),
})

export const FindTriggerByReleaseSchema = z.object({ triggerId: z.string(), releaseId: z.string() })

export async function validateTriggerPromptConfig(input: z.input<typeof ValidateTriggerPromptConfigSchema>) {
  const data = ValidateTriggerPromptConfigSchema.parse(input)
  if (!data.mode) return INVALID_CONFIG
  if (data.mode === "template") return isBlank(data.template) ? INVALID_CONFIG : { ok: true as const }
  if (data.mode === "script") return isBlank(data.script) ? INVALID_CONFIG : { ok: true as const }
  if (!data.promptId || !data.promptVersionMode) return INVALID_CONFIG

  if (data.promptVersionMode === "fixed") {
    if (!data.promptReleaseId) return INVALID_CONFIG
    const rel = await findPromptByRelease({ promptId: data.promptId, releaseId: data.promptReleaseId })
    return !rel || !hasContent(rel.mode, rel.content, rel.script) ? INVALID_CONFIG : { ok: true as const }
  }

  const prompt = await findPromptById(data.promptId)
  return !prompt || !hasContent(prompt.mode, prompt.content, prompt.script) ? INVALID_CONFIG : { ok: true as const }
}

export async function listTriggers(input?: z.input<typeof ListTriggersSchema>) {
  ListTriggersSchema.parse(input)
  const organizationId = principal.orgId()

  return withDb((db) =>
    db
      .select({
        id: TriggerTable.id,
        organizationId: TriggerTable.organizationId,
        name: TriggerTable.name,
        slug: TriggerTable.slug,
        currentReleaseId: TriggerTable.currentReleaseId,
        agentId: TriggerTable.agentId,
        createdAt: TriggerTable.createdAt,
        updatedAt: TriggerTable.updatedAt,
        version: TriggerReleaseTable.version,
        agentReleaseId: TriggerReleaseTable.agentReleaseId,
        agentVersionMode: TriggerReleaseTable.agentVersionMode,
        promptId: TriggerReleaseTable.promptId,
        promptReleaseId: TriggerReleaseTable.promptReleaseId,
        promptVersionMode: TriggerReleaseTable.promptVersionMode,
        mode: TriggerReleaseTable.mode,
        template: TriggerReleaseTable.template,
        script: TriggerReleaseTable.script,
        payloadSchema: TriggerReleaseTable.payloadSchema,
        type: TriggerReleaseTable.type,
        cron: TriggerReleaseTable.cron,
        timezone: TriggerReleaseTable.timezone,
        input: TriggerReleaseTable.input,
        appAccountId: TriggerReleaseTable.appAccountId,
        appId: AppAccountTable.appId,
        appEvents: TriggerReleaseTable.appEvents,
        configHash: TriggerReleaseTable.configHash,
        agent: {
          id: AgentTable.id,
          name: AgentTable.name,
          slug: AgentTable.slug,
          icon: AgentTable.icon,
          iconColor: AgentTable.iconColor,
        },
      })
      .from(TriggerTable)
      .innerJoin(TriggerReleaseTable, eq(TriggerTable.currentReleaseId, TriggerReleaseTable.id))
      .innerJoin(AgentTable, eq(TriggerTable.agentId, AgentTable.id))
      .leftJoin(AppAccountTable, eq(TriggerReleaseTable.appAccountId, AppAccountTable.id))
      .where(eq(TriggerTable.organizationId, organizationId)),
  )
}

export async function findTriggerById(id: string) {
  const organizationId = principal.orgId()
  return withDb((db) =>
    db
      .select({ ...getTableColumns(TriggerTable), ...releaseColumns })
      .from(TriggerTable)
      .leftJoin(TriggerReleaseTable, eq(TriggerTable.currentReleaseId, TriggerReleaseTable.id))
      .where(and(eq(TriggerTable.id, id), eq(TriggerTable.organizationId, organizationId)))
      .then(first),
  )
}

export async function getTriggerById(id: string) {
  const trigger = await findTriggerById(id)
  if (!trigger) throw createError("NotFoundError", { type: "Trigger", id })
  return trigger
}

export async function findTriggerBySlug(slug: string) {
  const organizationId = principal.orgId()
  return withDb((db) =>
    db
      .select({ ...getTableColumns(TriggerTable), ...releaseColumns })
      .from(TriggerTable)
      .leftJoin(TriggerReleaseTable, eq(TriggerTable.currentReleaseId, TriggerReleaseTable.id))
      .where(and(eq(TriggerTable.organizationId, organizationId), eq(TriggerTable.slug, slug)))
      .then(first),
  )
}

export async function createTrigger(input: z.input<typeof CreateTriggerSchema>) {
  const data = CreateTriggerSchema.parse(input)
  const organizationId = principal.orgId()
  const mode = data.mode ?? "template"

  if (mode === "prompt") {
    if (!data.promptId) {
      throw new Error("Prompt mode requires promptId")
    }
    if (data.template || data.script || data.payloadSchema) {
      throw new Error("Cannot set template, script, or payloadSchema when mode is prompt")
    }
  }

  if (data.promptId) {
    const prompt = await getPromptById(data.promptId)
    if (prompt?.agentId !== data.agentId) {
      throw new Error("Prompt agent must match trigger agent")
    }
  }

  const userId = principal.userId()
  const slug = data.slug || generateSlug(data.name) || generateRandomId()
  if (isReservedSlug(slug)) {
    throw createError("BadRequestError", { message: `Slug "${slug}" is reserved` })
  }
  const versionParsed = parseVersion(data.initialVersion ?? "0.0.1")
  const versionText = stringifyVersion(versionParsed)

  const config = {
    agentId: data.agentId,
    agentReleaseId: data.agentReleaseId ?? null,
    agentVersionMode: data.agentVersionMode ?? "current",
    promptId: data.promptId ?? null,
    promptReleaseId: data.promptReleaseId ?? null,
    promptVersionMode: data.promptVersionMode ?? "current",
    mode,
    template: data.template ?? "",
    script: data.script ?? "",
    payloadSchema: normalizeInputSchema(data.payloadSchema),
    type: data.type ?? "webhook",
    cron: data.cron ?? null,
    timezone: data.timezone ?? "UTC",
    input: data.input ?? null,
    appAccountId: data.appAccountId ?? null,
    appEvents: data.appEvents ?? null,
  }
  const configHashValue = hashConfig(config)

  const triggerId = await withTx(async (db) => {
    const [trigger] = await db
      .insert(TriggerTable)
      .values({
        organizationId,
        agentId: data.agentId,
        name: data.name,
        slug,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning()

    const [release] = await db
      .insert(TriggerReleaseTable)
      .values({
        triggerId: trigger.id,
        version: versionText,
        versionMajor: versionParsed.major,
        versionMinor: versionParsed.minor,
        versionPatch: versionParsed.patch,
        description: data.description ?? "Initial release",
        agentReleaseId: config.agentReleaseId,
        agentVersionMode: config.agentVersionMode,
        promptId: config.promptId,
        promptReleaseId: config.promptReleaseId,
        promptVersionMode: config.promptVersionMode,
        mode: config.mode,
        template: config.template,
        script: config.script,
        payloadSchema: config.payloadSchema,
        type: config.type,
        cron: config.cron,
        timezone: config.timezone,
        input: config.input,
        appAccountId: config.appAccountId,
        appEvents: config.appEvents,
        configHash: configHashValue,
        publishedAt: new Date(),
        createdBy: userId,
      })
      .returning()

    await db.insert(TriggerWorkingCopyTable).values({
      triggerId: trigger.id,
      agentReleaseId: config.agentReleaseId,
      agentVersionMode: config.agentVersionMode,
      promptId: config.promptId,
      promptReleaseId: config.promptReleaseId,
      promptVersionMode: config.promptVersionMode,
      mode: config.mode,
      template: config.template,
      script: config.script,
      payloadSchema: config.payloadSchema,
      type: config.type,
      cron: config.cron,
      timezone: config.timezone,
      input: config.input,
      appAccountId: config.appAccountId,
      appEvents: config.appEvents,
      configHash: configHashValue,
      updatedBy: userId,
    })

    await db
      .update(TriggerTable)
      .set({ currentReleaseId: release.id, updatedBy: userId, updatedAt: new Date() })
      .where(eq(TriggerTable.id, trigger.id))

    return trigger.id
  })

  return findTriggerById(triggerId)
}

export async function updateTrigger(input: z.input<typeof UpdateTriggerSchema>) {
  const data = UpdateTriggerSchema.parse(input)
  if (data.slug !== undefined && isReservedSlug(data.slug)) {
    throw createError("BadRequestError", { message: `Slug "${data.slug}" is reserved` })
  }
  await getTriggerById(data.id)
  if (data.name === undefined && data.slug === undefined) return findTriggerById(data.id)

  await withDb((db) =>
    db
      .update(TriggerTable)
      .set({
        updatedAt: new Date(),
        updatedBy: principal.userId(),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.slug !== undefined && { slug: data.slug }),
      })
      .where(eq(TriggerTable.id, data.id)),
  )
  return findTriggerById(data.id)
}

export async function saveTriggerWorkingCopy(input: z.input<typeof SaveTriggerWorkingCopySchema>) {
  const data = SaveTriggerWorkingCopySchema.parse(input)
  const owned = await getTriggerById(data.triggerId)
  const existing = await withDb((db) =>
    db.select().from(TriggerWorkingCopyTable).where(eq(TriggerWorkingCopyTable.triggerId, data.triggerId)).then(first),
  )

  if (data.promptId) {
    const prompt = await getPromptById(data.promptId)
    if (prompt?.agentId !== owned.agentId) {
      throw new Error("Prompt agent must match trigger agent")
    }
  }

  const agentId = owned.agentId
  const agentReleaseId = data.agentReleaseId ?? existing?.agentReleaseId ?? null
  const agentVersionMode = data.agentVersionMode ?? existing?.agentVersionMode ?? "current"
  const promptId = data.promptId ?? existing?.promptId ?? null
  const promptReleaseId = data.promptReleaseId ?? existing?.promptReleaseId ?? null
  const promptVersionMode = data.promptVersionMode ?? existing?.promptVersionMode ?? "current"
  const mode = data.mode ?? existing?.mode ?? "template"
  const template = data.template ?? existing?.template ?? ""
  const script = data.script ?? existing?.script ?? ""
  const payloadSchema = normalizeInputSchema(data.payloadSchema ?? existing?.payloadSchema)
  const type = data.type ?? existing?.type ?? "webhook"
  const cron = data.cron ?? existing?.cron ?? null
  const timezone = data.timezone ?? existing?.timezone ?? "UTC"
  const triggerInput = (data.input ?? existing?.input ?? null) as Record<string, unknown> | null
  const appAccountId = data.appAccountId ?? existing?.appAccountId ?? null
  const appEvents = data.appEvents ?? existing?.appEvents ?? null

  const configHash = hashConfig({
    agentId,
    agentReleaseId,
    agentVersionMode,
    promptId,
    promptReleaseId,
    promptVersionMode,
    mode,
    template,
    script,
    payloadSchema,
    type,
    cron,
    timezone,
    input: triggerInput,
    appAccountId,
    appEvents,
  })
  const userId = principal.userId()

  await withDb((db) =>
    db
      .insert(TriggerWorkingCopyTable)
      .values({
        triggerId: data.triggerId,
        agentReleaseId,
        agentVersionMode,
        promptId,
        promptReleaseId,
        promptVersionMode,
        mode,
        template,
        script,
        payloadSchema,
        type,
        cron,
        timezone,
        input: triggerInput,
        appAccountId,
        appEvents,
        configHash,
        updatedBy: userId,
      })
      .onConflictDoUpdate({
        target: TriggerWorkingCopyTable.triggerId,
        set: {
          agentReleaseId,
          agentVersionMode,
          promptId,
          promptReleaseId,
          promptVersionMode,
          mode,
          template,
          script,
          payloadSchema,
          type,
          cron,
          timezone,
          input: triggerInput,
          appAccountId,
          appEvents,
          configHash,
          updatedBy: userId,
          updatedAt: new Date(),
        },
      }),
  )

  return { triggerId: data.triggerId, configHash }
}

export async function getTriggerWorkingCopy(triggerId: string) {
  await getTriggerById(triggerId)
  return withDb((db) =>
    db
      .select(getTableColumns(TriggerWorkingCopyTable))
      .from(TriggerWorkingCopyTable)
      .where(eq(TriggerWorkingCopyTable.triggerId, triggerId))
      .then(first),
  )
}

export async function deployTrigger(input: z.input<typeof DeployTriggerSchema>) {
  const data = DeployTriggerSchema.parse(input)
  await getTriggerById(data.triggerId)
  const working = await withDb((db) =>
    db.select().from(TriggerWorkingCopyTable).where(eq(TriggerWorkingCopyTable.triggerId, data.triggerId)).then(first),
  )
  if (!working) throw new Error("Working copy not found")
  if (working.mode === "prompt" && !working.promptId) throw new Error("Prompt mode requires a prompt to be selected")
  if (working.mode === "template" && isBlank(working.template))
    throw new Error("Template mode requires a non-empty template")
  if (working.mode === "script" && isBlank(working.script)) throw new Error("Script mode requires a non-empty script")
  if (data.version && data.bump) throw new Error("Specify either version or bump, not both")

  const userId = principal.userId()
  const [release] = await withTx(async (db) => {
    const latest = await db
      .select({
        major: TriggerReleaseTable.versionMajor,
        minor: TriggerReleaseTable.versionMinor,
        patch: TriggerReleaseTable.versionPatch,
      })
      .from(TriggerReleaseTable)
      .where(eq(TriggerReleaseTable.triggerId, data.triggerId))
      .orderBy(
        desc(TriggerReleaseTable.versionMajor),
        desc(TriggerReleaseTable.versionMinor),
        desc(TriggerReleaseTable.versionPatch),
      )
      .limit(1)
      .then(first)
    const target = data.version ? parseVersion(data.version) : bumpVersion(latest ?? null, data.bump ?? "patch")

    const [created] = await db
      .insert(TriggerReleaseTable)
      .values({
        triggerId: data.triggerId,
        version: stringifyVersion(target),
        versionMajor: target.major,
        versionMinor: target.minor,
        versionPatch: target.patch,
        description: data.description,
        agentReleaseId: working.agentReleaseId,
        agentVersionMode: working.agentVersionMode,
        promptId: working.promptId,
        promptReleaseId: working.promptReleaseId,
        promptVersionMode: working.promptVersionMode,
        mode: working.mode,
        template: working.template,
        script: working.script,
        payloadSchema: working.payloadSchema,
        type: working.type,
        cron: working.cron,
        timezone: working.timezone,
        input: working.input,
        appAccountId: working.appAccountId,
        appEvents: working.appEvents,
        configHash: working.configHash,
        publishedAt: new Date(),
        createdBy: userId,
      })
      .returning()

    await db
      .update(TriggerTable)
      .set({ currentReleaseId: created.id, updatedAt: new Date(), updatedBy: userId })
      .where(eq(TriggerTable.id, data.triggerId))
    await db
      .update(TriggerWorkingCopyTable)
      .set({ updatedAt: new Date(), updatedBy: userId })
      .where(eq(TriggerWorkingCopyTable.triggerId, data.triggerId))
    return [created]
  })
  return release
}

export async function adoptTrigger(input: z.input<typeof AdoptTriggerSchema>) {
  const data = AdoptTriggerSchema.parse(input)
  const release = await loadRelease(data.triggerId, data.releaseId)
  if (!release) throw new Error("Release not found")
  const userId = principal.userId()
  await withDb((db) =>
    db
      .update(TriggerTable)
      .set({ currentReleaseId: release.id, updatedAt: new Date(), updatedBy: userId })
      .where(eq(TriggerTable.id, data.triggerId)),
  )
  return release
}

export async function checkoutTrigger(input: z.input<typeof CheckoutTriggerSchema>) {
  const data = CheckoutTriggerSchema.parse(input)
  const release = await loadRelease(data.triggerId, data.releaseId)
  if (!release) throw new Error("Release not found")
  const userId = principal.userId()

  await withDb((db) =>
    db
      .insert(TriggerWorkingCopyTable)
      .values({
        triggerId: data.triggerId,
        agentReleaseId: release.agentReleaseId,
        agentVersionMode: release.agentVersionMode,
        promptId: release.promptId,
        promptReleaseId: release.promptReleaseId,
        promptVersionMode: release.promptVersionMode,
        mode: release.mode,
        template: release.template,
        script: release.script,
        payloadSchema: release.payloadSchema,
        type: release.type,
        cron: release.cron,
        timezone: release.timezone,
        input: release.input,
        appAccountId: release.appAccountId,
        appEvents: release.appEvents,
        configHash: release.configHash,
        updatedBy: userId,
      })
      .onConflictDoUpdate({
        target: TriggerWorkingCopyTable.triggerId,
        set: {
          agentReleaseId: release.agentReleaseId,
          agentVersionMode: release.agentVersionMode,
          promptId: release.promptId,
          promptReleaseId: release.promptReleaseId,
          promptVersionMode: release.promptVersionMode,
          mode: release.mode,
          template: release.template,
          script: release.script,
          payloadSchema: release.payloadSchema,
          type: release.type,
          cron: release.cron,
          timezone: release.timezone,
          input: release.input,
          appAccountId: release.appAccountId,
          appEvents: release.appEvents,
          configHash: release.configHash,
          updatedBy: userId,
          updatedAt: new Date(),
        },
      }),
  )
  return { triggerId: data.triggerId, releaseId: data.releaseId }
}

export async function listTriggerReleases(triggerId: string) {
  const organizationId = principal.orgId()
  return withDb((db) =>
    db
      .select({
        id: TriggerReleaseTable.id,
        triggerId: TriggerReleaseTable.triggerId,
        version: TriggerReleaseTable.version,
        versionMajor: TriggerReleaseTable.versionMajor,
        versionMinor: TriggerReleaseTable.versionMinor,
        versionPatch: TriggerReleaseTable.versionPatch,
        description: TriggerReleaseTable.description,
        configHash: TriggerReleaseTable.configHash,
        payloadSchema: TriggerReleaseTable.payloadSchema,
        publishedAt: TriggerReleaseTable.publishedAt,
        createdAt: TriggerReleaseTable.createdAt,
        createdBy: {
          id: UserTable.id,
          name: UserTable.name,
          email: UserTable.email,
          image: UserTable.image,
        },
      })
      .from(TriggerReleaseTable)
      .innerJoin(TriggerTable, eq(TriggerReleaseTable.triggerId, TriggerTable.id))
      .innerJoin(UserTable, eq(TriggerReleaseTable.createdBy, UserTable.id))
      .where(and(eq(TriggerReleaseTable.triggerId, triggerId), eq(TriggerTable.organizationId, organizationId)))
      .orderBy(
        desc(TriggerReleaseTable.versionMajor),
        desc(TriggerReleaseTable.versionMinor),
        desc(TriggerReleaseTable.versionPatch),
        desc(TriggerReleaseTable.createdAt),
      ),
  )
}

export async function removeTrigger(id: string) {
  await getTriggerById(id)
  const [deleted] = await withDb((db) =>
    db.delete(TriggerTable).where(eq(TriggerTable.id, id)).returning({ id: TriggerTable.id }),
  )
  return deleted
}

export async function addTriggerEnvironment(input: z.input<typeof AddTriggerEnvironmentSchema>) {
  const data = AddTriggerEnvironmentSchema.parse(input)
  const trigger = await getTriggerById(data.triggerId)
  const isWebhook = trigger.type === "webhook"

  const [env] = await withDb((db) =>
    db
      .insert(TriggerEnvironmentTable)
      .values({
        triggerId: data.triggerId,
        environmentId: data.environmentId,
        channelId: data.channelId,
        webhookSecret: isWebhook ? generateSecret() : null,
        debugSecret: generateSecret(),
        active: false,
      })
      .returning(),
  )

  return env
}

export async function removeTriggerEnvironment(input: z.input<typeof RemoveTriggerEnvironmentSchema>) {
  const data = RemoveTriggerEnvironmentSchema.parse(input)
  const [deleted] = await withDb((db) =>
    db
      .delete(TriggerEnvironmentTable)
      .where(
        and(
          eq(TriggerEnvironmentTable.triggerId, data.triggerId),
          eq(TriggerEnvironmentTable.environmentId, data.environmentId),
        ),
      )
      .returning({ id: TriggerEnvironmentTable.id }),
  )
  return deleted
}

export async function updateTriggerEnvironment(input: z.input<typeof UpdateTriggerEnvironmentSchema>) {
  const data = UpdateTriggerEnvironmentSchema.parse(input)
  const updateData: Record<string, unknown> = { updatedAt: new Date() }
  if (data.channelId !== undefined) updateData.channelId = data.channelId

  const [updated] = await withDb((db) =>
    db
      .update(TriggerEnvironmentTable)
      .set(updateData)
      .where(
        and(
          eq(TriggerEnvironmentTable.triggerId, data.triggerId),
          eq(TriggerEnvironmentTable.environmentId, data.environmentId),
        ),
      )
      .returning(),
  )

  if (!updated) throw new Error("Trigger environment not found")

  return updated
}

export async function listTriggerEnvironments(triggerId: string) {
  return withDb((db) =>
    db
      .select({
        id: TriggerEnvironmentTable.id,
        triggerId: TriggerEnvironmentTable.triggerId,
        environmentId: TriggerEnvironmentTable.environmentId,
        channelId: TriggerEnvironmentTable.channelId,
        webhookSecret: TriggerEnvironmentTable.webhookSecret,
        debugSecret: TriggerEnvironmentTable.debugSecret,
        active: TriggerEnvironmentTable.active,
        createdAt: TriggerEnvironmentTable.createdAt,
        updatedAt: TriggerEnvironmentTable.updatedAt,
        environment: {
          id: EnvironmentTable.id,
          name: EnvironmentTable.name,
          slug: EnvironmentTable.slug,
          color: EnvironmentTable.color,
        },
        channel: {
          id: ChannelTable.id,
          name: ChannelTable.name,
          slug: ChannelTable.slug,
          icon: ChannelTable.icon,
          iconColor: ChannelTable.iconColor,
        },
      })
      .from(TriggerEnvironmentTable)
      .innerJoin(EnvironmentTable, eq(TriggerEnvironmentTable.environmentId, EnvironmentTable.id))
      .innerJoin(ChannelTable, eq(TriggerEnvironmentTable.channelId, ChannelTable.id))
      .where(eq(TriggerEnvironmentTable.triggerId, triggerId)),
  )
}

export async function toggleTriggerEnvironment(input: z.input<typeof ToggleTriggerEnvironmentSchema>) {
  const data = ToggleTriggerEnvironmentSchema.parse(input)
  const env = await withDb((db) =>
    db
      .select()
      .from(TriggerEnvironmentTable)
      .where(
        and(
          eq(TriggerEnvironmentTable.triggerId, data.triggerId),
          eq(TriggerEnvironmentTable.environmentId, data.environmentId),
        ),
      )
      .then(first),
  )
  if (!env) throw new Error("Trigger environment not found")

  const [updated] = await withDb((db) =>
    db
      .update(TriggerEnvironmentTable)
      .set({ active: !env.active, updatedAt: new Date() })
      .where(eq(TriggerEnvironmentTable.id, env.id))
      .returning(),
  )
  return updated
}

export async function regenerateTriggerWebhookSecret(input: z.input<typeof RegenerateTriggerWebhookSecretSchema>) {
  const data = RegenerateTriggerWebhookSecretSchema.parse(input)
  const secret = generateSecret()

  const [updated] = await withDb((db) =>
    db
      .update(TriggerEnvironmentTable)
      .set({ webhookSecret: secret, updatedAt: new Date() })
      .where(
        and(
          eq(TriggerEnvironmentTable.triggerId, data.triggerId),
          eq(TriggerEnvironmentTable.environmentId, data.environmentId),
        ),
      )
      .returning({ id: TriggerEnvironmentTable.id, webhookSecret: TriggerEnvironmentTable.webhookSecret }),
  )

  if (!updated) throw new Error("Trigger environment not found")

  return updated
}

export async function regenerateTriggerDebugSecret(input: z.input<typeof RegenerateTriggerDebugSecretSchema>) {
  const data = RegenerateTriggerDebugSecretSchema.parse(input)
  const secret = generateSecret()

  const [updated] = await withDb((db) =>
    db
      .update(TriggerEnvironmentTable)
      .set({ debugSecret: secret, updatedAt: new Date() })
      .where(
        and(
          eq(TriggerEnvironmentTable.triggerId, data.triggerId),
          eq(TriggerEnvironmentTable.environmentId, data.environmentId),
        ),
      )
      .returning({ id: TriggerEnvironmentTable.id, debugSecret: TriggerEnvironmentTable.debugSecret }),
  )

  if (!updated) throw new Error("Trigger environment not found")

  return updated
}

export async function listActiveTriggersByAppAccountAndEvent(
  input: z.input<typeof ListActiveTriggersByAppAccountAndEventSchema>,
) {
  const data = ListActiveTriggersByAppAccountAndEventSchema.parse(input)
  return withDb((db) =>
    db
      .select({
        triggerId: TriggerTable.id,
        organizationId: TriggerTable.organizationId,
        name: TriggerTable.name,
        slug: TriggerTable.slug,
        currentReleaseId: TriggerTable.currentReleaseId,
        agentId: TriggerTable.agentId,
        environmentId: TriggerEnvironmentTable.environmentId,
        channelId: TriggerEnvironmentTable.channelId,
        active: TriggerEnvironmentTable.active,
        agentReleaseId: TriggerReleaseTable.agentReleaseId,
        agentVersionMode: TriggerReleaseTable.agentVersionMode,
        promptId: TriggerReleaseTable.promptId,
        promptReleaseId: TriggerReleaseTable.promptReleaseId,
        promptVersionMode: TriggerReleaseTable.promptVersionMode,
        mode: TriggerReleaseTable.mode,
        template: TriggerReleaseTable.template,
        script: TriggerReleaseTable.script,
        payloadSchema: TriggerReleaseTable.payloadSchema,
        type: TriggerReleaseTable.type,
        cron: TriggerReleaseTable.cron,
        timezone: TriggerReleaseTable.timezone,
        input: TriggerReleaseTable.input,
        appAccountId: TriggerReleaseTable.appAccountId,
        appEvents: TriggerReleaseTable.appEvents,
      })
      .from(TriggerTable)
      .innerJoin(TriggerReleaseTable, eq(TriggerTable.currentReleaseId, TriggerReleaseTable.id))
      .innerJoin(TriggerEnvironmentTable, eq(TriggerTable.id, TriggerEnvironmentTable.triggerId))
      .where(
        and(
          eq(TriggerReleaseTable.appAccountId, data.appAccountId),
          sql`${data.eventType} = ANY(${TriggerReleaseTable.appEvents})`,
          eq(TriggerEnvironmentTable.active, true),
        ),
      ),
  )
}

export async function findTriggerByWebhookPath(input: z.input<typeof FindTriggerByWebhookPathSchema>) {
  const data = FindTriggerByWebhookPathSchema.parse(input)
  type WebhookTrigger = {
    trigger_id: string
    current_release_id: string
    agent_id: string
    agent_release_id: string | null
    agent_version_mode: "current" | "fixed"
    prompt_id: string | null
    prompt_release_id: string | null
    prompt_version_mode: "current" | "fixed"
    mode: "prompt" | "template" | "script"
    template: string | null
    script: string | null
    payload_schema: Record<string, unknown> | null
    environment_id: string
    channel_id: string
    slug: string
    webhook_secret: string | null
    debug_secret: string | null
    active: boolean
    agent_slug: string
    organization_id: string
  }

  return withDb(async (db) => {
    const rows = await db.execute<WebhookTrigger>(sql`
      SELECT
        t.id as trigger_id, t.current_release_id,
        t.agent_id, tr.agent_release_id, tr.agent_version_mode,
        tr.prompt_id, tr.prompt_release_id, tr.prompt_version_mode,
        tr.mode, tr.template, tr.script, tr.payload_schema,
        te.environment_id, te.channel_id, t.slug,
        te.webhook_secret, te.debug_secret, te.active,
        a.slug as agent_slug, t.organization_id
      FROM trigger t
      INNER JOIN trigger_release tr ON t.current_release_id = tr.id
      INNER JOIN trigger_environment te ON t.id = te.trigger_id
      INNER JOIN environment e ON te.environment_id = e.id
      INNER JOIN agent a ON t.agent_id = a.id
      INNER JOIN organization o ON t.organization_id = o.id
      WHERE o.slug = ${data.orgSlug} AND e.slug = ${data.envSlug} AND t.slug = ${data.triggerSlug}
    `)
    return rows.rows[0]
  })
}

export async function findTriggerByRunPath(input: z.input<typeof FindTriggerByRunPathSchema>) {
  const data = FindTriggerByRunPathSchema.parse(input)
  type RunTrigger = {
    trigger_id: string
    release_id: string | null
    agent_id: string
    agent_release_id: string | null
    agent_version_mode: "current" | "fixed"
    prompt_id: string | null
    prompt_release_id: string | null
    prompt_version_mode: "current" | "fixed"
    mode: "prompt" | "template" | "script"
    template: string | null
    script: string | null
    payload_schema: Record<string, unknown> | null
    environment_id: string
    channel_id: string
    slug: string
    debug_secret: string | null
    agent_slug: string
    organization_id: string
  }

  const isPreview = data.version === "preview"
  const isLatest = data.version === "latest"
  const version = data.version.startsWith("v") ? data.version.slice(1) : data.version

  if (isPreview) {
    const rows = await withDb((db) =>
      db.execute<RunTrigger>(sql`
        SELECT
          t.id as trigger_id, NULL as release_id,
          t.agent_id, wc.agent_release_id, wc.agent_version_mode,
          wc.prompt_id, wc.prompt_release_id, wc.prompt_version_mode,
          wc.mode, wc.template, wc.script, wc.payload_schema,
          te.environment_id, te.channel_id, t.slug, te.debug_secret,
          a.slug as agent_slug, t.organization_id
        FROM trigger t
        INNER JOIN trigger_working_copy wc ON t.id = wc.trigger_id
        INNER JOIN trigger_environment te ON t.id = te.trigger_id
        INNER JOIN environment e ON te.environment_id = e.id
        INNER JOIN agent a ON t.agent_id = a.id
        INNER JOIN organization o ON t.organization_id = o.id
        WHERE o.slug = ${data.orgSlug} AND e.slug = ${data.envSlug} AND t.slug = ${data.triggerSlug}
      `),
    )
    return rows.rows[0]
  }

  if (isLatest) {
    const rows = await withDb((db) =>
      db.execute<RunTrigger>(sql`
        SELECT
          t.id as trigger_id, t.current_release_id as release_id,
          t.agent_id, tr.agent_release_id, tr.agent_version_mode,
          tr.prompt_id, tr.prompt_release_id, tr.prompt_version_mode,
          tr.mode, tr.template, tr.script, tr.payload_schema,
          te.environment_id, te.channel_id, t.slug, te.debug_secret,
          a.slug as agent_slug, t.organization_id
        FROM trigger t
        INNER JOIN trigger_release tr ON t.current_release_id = tr.id
        INNER JOIN trigger_environment te ON t.id = te.trigger_id
        INNER JOIN environment e ON te.environment_id = e.id
        INNER JOIN agent a ON t.agent_id = a.id
        INNER JOIN organization o ON t.organization_id = o.id
        WHERE o.slug = ${data.orgSlug} AND e.slug = ${data.envSlug} AND t.slug = ${data.triggerSlug}
      `),
    )
    return rows.rows[0]
  }

  const rows = await withDb((db) =>
    db.execute<RunTrigger>(sql`
      SELECT
        t.id as trigger_id, tr.id as release_id,
        t.agent_id, tr.agent_release_id, tr.agent_version_mode,
        tr.prompt_id, tr.prompt_release_id, tr.prompt_version_mode,
        tr.mode, tr.template, tr.script, tr.payload_schema,
        te.environment_id, te.channel_id, t.slug, te.debug_secret,
        a.slug as agent_slug, t.organization_id
      FROM trigger t
      INNER JOIN trigger_release tr ON t.id = tr.trigger_id
      INNER JOIN trigger_environment te ON t.id = te.trigger_id
      INNER JOIN environment e ON te.environment_id = e.id
      INNER JOIN agent a ON t.agent_id = a.id
      INNER JOIN organization o ON t.organization_id = o.id
      WHERE o.slug = ${data.orgSlug} AND e.slug = ${data.envSlug} AND t.slug = ${data.triggerSlug}
        AND tr.version = ${version}
    `),
  )
  return rows.rows[0]
}

export async function findTriggerByRelease(input: z.input<typeof FindTriggerByReleaseSchema>) {
  const data = FindTriggerByReleaseSchema.parse(input)
  const release = await loadRelease(data.triggerId, data.releaseId)
  if (!release) return null
  return release
}
