import { Hono } from "hono"
import { getRecipeById, getRecipeRelease, extractBindingRefs } from "@synatra/core"
import type { RecipeStepConfig, ParamBinding } from "@synatra/core/types"

function getConfigBinding(config: RecipeStepConfig): ParamBinding | null {
  if ("binding" in config) return config.binding
  return null
}

export const get = new Hono().get("/:id", async (c) => {
  const recipe = await getRecipeById(c.req.param("id"))

  if (recipe.currentReleaseId) {
    const release = await getRecipeRelease(recipe.id, recipe.currentReleaseId)
    const steps = release.steps.map((s) => {
      const binding = getConfigBinding(s.config)
      const bindingRefs = binding ? extractBindingRefs(binding) : []
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
