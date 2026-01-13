import { z } from "zod"

export type PromptInputSchema = Record<string, unknown>

export const PromptMode = ["template", "script"] as const
export type PromptMode = (typeof PromptMode)[number]

export const ScriptResultSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("skip"), reason: z.string().optional() }),
  z.object({ action: z.literal("run"), prompt: z.string() }),
])
export type ScriptResult = z.infer<typeof ScriptResultSchema>

export type PromptRelease = {
  id: string
  promptId: string
  version: string
  versionMajor: number
  versionMinor: number
  versionPatch: number
  description: string
  mode: PromptMode
  content: string
  script: string | null
  inputSchema: unknown
  contentHash: string
  publishedAt: string
  createdBy: string
  createdAt: string
}
