import { Hono } from "hono"
import { z } from "zod"
import { zValidator } from "@hono/zod-validator"
import { generateText, Output, jsonSchema, type JSONSchema7 } from "ai"
import { loadConversationContext, buildRecipeExtractionPrompt, validateRecipeSteps } from "@synatra/core"
import { getModel } from "../agents/copilot/models"
import type { RecipeStep, RecipeInput, RecipeOutput, ParamBinding } from "@synatra/core/types"
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

  const { model } = await getModel(body.modelId)

  const result = await generateText({
    model,
    output: Output.object({ schema: jsonSchema<ExtractedRecipe>(RecipeJsonSchema) }),
    prompt,
  })

  const extracted = result.output as ExtractedRecipe
  const inputs = extracted.inputs ?? []
  const outputs = extracted.outputs ?? []

  const steps: RecipeStep[] = extracted.steps.map((s) => ({
    id: s.id,
    toolName: s.toolName,
    params: s.params,
    dependsOn: s.dependsOn,
  }))

  const validation = validateRecipeSteps(steps)
  if (!validation.valid) {
    throw createError("BadRequestError", { message: `Invalid recipe: ${validation.errors.join(", ")}` })
  }

  return c.json({
    name: extracted.name,
    description: extracted.description,
    inputs: inputs.map((i) => ({
      key: i.key,
      label: i.label,
      type: i.type as RecipeInput["type"],
      required: i.required,
    })),
    steps,
    outputs: outputs.map((o) => ({
      stepId: o.stepId,
      kind: o.kind as RecipeOutput["kind"],
      name: o.name,
    })),
  })
})
