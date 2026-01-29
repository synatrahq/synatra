import { Hono } from "hono"
import { getRecipeById, getRecipeRelease } from "@synatra/core"

export const get = new Hono().get("/:id", async (c) => {
  const recipe = await getRecipeById(c.req.param("id"))

  if (recipe.currentReleaseId) {
    const release = await getRecipeRelease(recipe.id, recipe.currentReleaseId)
    return c.json({
      ...recipe,
      version: release.version,
      inputs: release.inputs,
      outputs: release.outputs,
      steps: release.steps.map((s) => ({
        stepKey: s.stepKey,
        label: s.label,
        toolName: s.toolName ?? "",
        params: s.params,
        dependsOn: release.edges.filter((e) => e.toStepKey === s.stepKey).map((e) => e.fromStepKey),
      })),
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
