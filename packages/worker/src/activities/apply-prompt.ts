import type { ConversationMessage } from "./call-llm"

export interface ApplyPromptInput {
  prompt: string
  payload: Record<string, unknown>
}

export interface ApplyPromptResult {
  messages: ConversationMessage[]
}

export async function applyPrompt(input: ApplyPromptInput): Promise<ApplyPromptResult> {
  const { prompt, payload } = input
  if (!prompt.trim()) {
    throw new Error("Prompt is empty")
  }

  const content = renderTemplate(prompt, payload)

  return { messages: [{ role: "user", content }] }
}

export function renderTemplate(template: string, payload: Record<string, unknown>): string {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload must be an object")
  }

  const resolve = (path: string) => {
    const keys = path.split(".")
    let current: unknown = payload
    for (const key of keys) {
      if (!current || typeof current !== "object") {
        return undefined
      }
      current = (current as Record<string, unknown>)[key]
    }
    return current
  }

  const replace = (_: string, expr: string) => {
    const path = expr.trim()
    if (!path) {
      throw new Error("Empty placeholder")
    }

    const value = resolve(path)
    if (value === undefined) {
      throw new Error(`Missing value for "${path}"`)
    }
    if (value === null) {
      return "null"
    }
    if (typeof value === "object") {
      return JSON.stringify(value)
    }
    return String(value)
  }

  return template.replace(/{{\s*([^}]+)\s*}}/g, replace)
}
