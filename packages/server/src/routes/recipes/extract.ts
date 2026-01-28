import { Hono } from "hono"
import { z } from "zod"
import { zValidator } from "@hono/zod-validator"
import { generateText, Output, jsonSchema, type JSONSchema7 } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { createAnthropic } from "@ai-sdk/anthropic"
import {
  loadConversationContext,
  buildRecipeExtractionPrompt,
  validateRecipeSteps,
  getResourceProviderConfig,
} from "@synatra/core"
import type { RecipeStep, RecipeInput, RecipeOutput, ParamBinding } from "@synatra/core/types"

const ExtractRequestSchema = z.object({
  threadId: z.string(),
  runId: z.string(),
  environmentId: z.string(),
  modelId: z.string().optional(),
})

const RecipeJsonSchema: JSONSchema7 = {
  type: "object",
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    inputs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          type: { type: "string", enum: ["string", "number", "date", "dateRange", "select"] },
          required: { type: "boolean" },
        },
        required: ["key", "label", "type", "required"],
      },
    },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          toolName: { type: "string" },
          params: { type: "object", additionalProperties: { $ref: "#/$defs/binding" } },
          dependsOn: { type: "array", items: { type: "string" } },
        },
        required: ["id", "toolName", "params", "dependsOn"],
      },
    },
    outputs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          stepId: { type: "string" },
          kind: { type: "string", enum: ["table", "chart", "markdown", "key_value"] },
          name: { type: "string" },
        },
        required: ["stepId", "kind"],
      },
    },
  },
  required: ["name", "description", "steps"],
  $defs: {
    binding: {
      oneOf: [
        { type: "object", properties: { type: { const: "static" }, value: {} }, required: ["type", "value"] },
        {
          type: "object",
          properties: { type: { const: "input" }, inputKey: { type: "string" } },
          required: ["type", "inputKey"],
        },
        {
          type: "object",
          properties: { type: { const: "step" }, stepId: { type: "string" }, path: { type: "string" } },
          required: ["type", "stepId"],
        },
        {
          type: "object",
          properties: {
            type: { const: "template" },
            template: { type: "string" },
            variables: { type: "object", additionalProperties: { $ref: "#/$defs/binding" } },
          },
          required: ["type", "template", "variables"],
        },
        {
          type: "object",
          properties: {
            type: { const: "object" },
            entries: { type: "object", additionalProperties: { $ref: "#/$defs/binding" } },
          },
          required: ["type", "entries"],
        },
      ],
    },
  },
}

type ExtractedRecipe = {
  name: string
  description: string
  inputs: Array<{ key: string; label: string; type: string; required: boolean }>
  steps: Array<{ id: string; toolName: string; params: Record<string, ParamBinding>; dependsOn: string[] }>
  outputs: Array<{ stepId: string; kind: string; name?: string }>
}

export const extract = new Hono().post("/extract", zValidator("json", ExtractRequestSchema), async (c) => {
  const body = c.req.valid("json")
  const context = await loadConversationContext(body)
  const prompt = buildRecipeExtractionPrompt(context)

  const llmConfig = await getResourceProviderConfig({
    environmentId: body.environmentId,
    provider: "anthropic",
  })

  if (!llmConfig) {
    const openaiConfig = await getResourceProviderConfig({
      environmentId: body.environmentId,
      provider: "openai",
    })
    if (!openaiConfig) {
      return c.json({ error: "No LLM provider configured" }, 400)
    }
  }

  const useAnthropic = !!llmConfig
  const config =
    llmConfig ?? (await getResourceProviderConfig({ environmentId: body.environmentId, provider: "openai" }))!

  const model = useAnthropic
    ? createAnthropic({ apiKey: config.apiKey, baseURL: config.baseUrl ?? undefined })("claude-sonnet-4-20250514")
    : createOpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl ?? undefined })("gpt-4o")

  const result = await generateText({
    model,
    output: Output.object({ schema: jsonSchema<ExtractedRecipe>(RecipeJsonSchema) }),
    prompt,
  })

  const extracted = result.output as ExtractedRecipe

  const steps: RecipeStep[] = extracted.steps.map((s) => ({
    id: s.id,
    toolName: s.toolName,
    params: s.params,
    dependsOn: s.dependsOn,
  }))

  const validation = validateRecipeSteps(steps)
  if (!validation.valid) {
    return c.json({ error: `Invalid recipe: ${validation.errors.join(", ")}` }, 400)
  }

  return c.json({
    name: extracted.name,
    description: extracted.description,
    inputs: extracted.inputs.map((i) => ({
      key: i.key,
      label: i.label,
      type: i.type as RecipeInput["type"],
      required: i.required,
    })),
    steps,
    outputs: extracted.outputs.map((o) => ({
      stepId: o.stepId,
      kind: o.kind as RecipeOutput["kind"],
      name: o.name,
    })),
  })
})
