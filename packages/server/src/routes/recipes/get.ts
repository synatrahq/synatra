import { Hono } from "hono"
import { getRecipeById, getRecipeRelease, extractBindingRefs } from "@synatra/core"
import type { RecipeStepConfig, ParamBinding } from "@synatra/core/types"

function extractStepBindingRefs(config: RecipeStepConfig): string[] {
  if ("params" in config && config.params && typeof config.params === "object") {
    if ("type" in config.params) {
      return extractBindingRefs(config.params as ParamBinding)
    }
    if ("fields" in config.params) {
      const params = config.params as {
        fields: Array<Record<string, ParamBinding>>
        title: ParamBinding
        description?: ParamBinding
      }
      const refs = extractBindingRefs(params.title)
      if (params.description) refs.push(...extractBindingRefs(params.description as ParamBinding))
      for (const field of params.fields) {
        for (const value of Object.values(field)) {
          if (value === undefined) continue
          refs.push(...extractBindingRefs(value))
        }
      }
      return refs
    }
  }
  return []
}

export const get = new Hono().get("/:id", async (c) => {
  const recipe = await getRecipeById(c.req.param("id"))

  if (recipe.currentReleaseId) {
    const release = await getRecipeRelease(recipe.id, recipe.currentReleaseId)
    const steps = release.steps.map((s) => {
      const bindingRefs = extractStepBindingRefs(s.config)
      const base = {
        stepKey: s.stepKey,
        label: s.label,
        bindingRefs,
      }
      if (s.type === "query") {
        return { ...base, type: "query" as const, config: s.config }
      }
      if (s.type === "code") {
        return { ...base, type: "code" as const, config: s.config }
      }
      if (s.type === "output") {
        return { ...base, type: "output" as const, config: s.config }
      }
      return { ...base, type: "input" as const, config: s.config }
    })
    return c.json({
      ...recipe,
      version: release.version,
      inputs: release.inputs,
      outputs: release.outputs,
      steps,
    })
  }

  return c.json({
    ...recipe,
    version: null,
    inputs: [],
    outputs: [],
    steps: [],
  })
})
