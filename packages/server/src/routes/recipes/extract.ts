import { Hono } from "hono"
import { z } from "zod"
import { zValidator } from "@hono/zod-validator"
import { generateText, tool, jsonSchema, hasToolCall, type JSONSchema7, type ModelMessage } from "ai"
import {
  loadConversationContext,
  buildRecipeExtractionPrompt,
  validateRecipeSteps,
  normalizeStepKeys,
  type RawStep,
} from "@synatra/core"
import { getModel } from "../agents/copilot/models"
import type { RecipeInput, RecipeOutput, ParamBinding } from "@synatra/core/types"
import { createError } from "@synatra/util/error"

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
          type: { type: "string", enum: ["string", "number"] },
          description: { type: "string" },
          required: { type: "boolean" },
          defaultValue: {},
        },
        required: ["key", "label", "type"],
      },
    },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          stepKey: { type: "string" },
          label: { type: "string" },
          toolName: { type: "string" },
          params: { type: "object", additionalProperties: { $ref: "#/$defs/binding" } },
        },
        required: ["stepKey", "label", "toolName", "params"],
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
          properties: { type: { const: "step" }, stepKey: { type: "string" }, path: { type: "string" } },
          required: ["type", "stepKey"],
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
        {
          type: "object",
          properties: {
            type: { const: "array" },
            items: { type: "array", items: { $ref: "#/$defs/binding" } },
          },
          required: ["type", "items"],
        },
      ],
    },
  },
}

type ExtractedRecipe = {
  name: string
  description: string
  inputs: Array<{
    key: string
    label: string
    type: string
    description?: string
    required?: boolean
    defaultValue?: unknown
  }>
  steps: RawStep[]
  outputs: Array<{ stepId: string; kind: string; name?: string }>
}

const MAX_RETRIES = 2

export const extract = new Hono().post("/extract", zValidator("json", ExtractRequestSchema), async (c) => {
  const body = c.req.valid("json")
  const context = await loadConversationContext(body)
  const prompt = buildRecipeExtractionPrompt(context)

  const { model } = await getModel(body.modelId)

  const submitRecipeTool = tool({
    description: "Submit the extracted recipe. You MUST call this tool with the complete recipe.",
    inputSchema: jsonSchema(RecipeJsonSchema as JSONSchema7),
  })

  const tools = { submit_recipe: submitRecipeTool }
  const messages: ModelMessage[] = [{ role: "user", content: prompt }]

  let retryCount = 0
  while (retryCount <= MAX_RETRIES) {
    const result = await generateText({
      model,
      tools,
      toolChoice: "required",
      stopWhen: hasToolCall("submit_recipe"),
      messages,
    })

    const toolCall = result.toolCalls[0]
    if (!toolCall || toolCall.toolName !== "submit_recipe") {
      throw createError("BadRequestError", { message: "LLM did not submit a recipe" })
    }

    const extracted = toolCall.input as ExtractedRecipe
    const {
      steps: normalizedSteps,
      keyMap,
      errors: normalizationErrors,
    } = normalizeStepKeys(extracted.steps ?? [], context.agentTools)

    const validation = validateRecipeSteps(normalizedSteps, (extracted.inputs ?? []) as RecipeInput[])
    const allErrors = [...normalizationErrors, ...validation.errors]
    if (normalizedSteps.length === 0 || allErrors.length > 0) {
      const errors = normalizedSteps.length === 0 ? ["Recipe must have at least one step"] : allErrors
      if (retryCount < MAX_RETRIES) {
        messages.push(
          {
            role: "assistant",
            content: [
              {
                type: "tool-call",
                toolCallId: toolCall.toolCallId,
                toolName: "submit_recipe",
                input: toolCall.input as Record<string, unknown>,
              },
            ],
          },
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: toolCall.toolCallId,
                toolName: "submit_recipe",
                output: {
                  type: "error-text" as const,
                  value: `Validation failed: ${errors.join(", ")}. Please fix and resubmit.`,
                },
              },
            ],
          },
        )
        retryCount++
        continue
      }
      throw createError("BadRequestError", { message: `Invalid recipe: ${errors.join(", ")}` })
    }

    const inputs = extracted.inputs ?? []
    const outputs = extracted.outputs ?? []

    return c.json({
      name: extracted.name,
      description: extracted.description,
      inputs: inputs.map((i) => ({
        key: i.key,
        label: i.label,
        type: i.type as RecipeInput["type"],
        required: i.required,
      })),
      steps: normalizedSteps,
      outputs: outputs.map((o) => ({
        stepId: keyMap.get(o.stepId) ?? o.stepId,
        kind: o.kind as RecipeOutput["kind"],
        name: o.name,
      })),
    })
  }

  throw createError("BadRequestError", { message: "Failed to extract valid recipe after retries" })
})
