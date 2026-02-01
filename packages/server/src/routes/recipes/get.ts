import { Hono } from "hono"
import { getRecipeById, getRecipeRelease, collectStepRefs } from "@synatra/core"

export const get = new Hono().get("/:id", async (c) => {
  const recipe = await getRecipeById(c.req.param("id"))

  if (recipe.currentReleaseId) {
    const release = await getRecipeRelease(recipe.id, recipe.currentReleaseId)
    const steps = release.steps.map((s) => ({
      stepKey: s.stepKey,
      label: s.label,
      bindingRefs: collectStepRefs(s.config),
      type: s.type,
      config: s.config,
    }))
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
