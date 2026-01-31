import { Hono } from "hono"
import { getRecipeById, getRecipeRelease } from "@synatra/core"

export const get = new Hono().get("/:id", async (c) => {
  const recipe = await getRecipeById(c.req.param("id"))

  if (recipe.currentReleaseId) {
    const release = await getRecipeRelease(recipe.id, recipe.currentReleaseId)
    const stepIdToKey = new Map(release.steps.map((s) => [s.id, s.stepKey]))
    const steps = release.steps.map((s) => {
      const base = {
        stepKey: s.stepKey,
        label: s.label,
        dependsOn: release.edges
          .filter((e) => e.toStepId === s.id)
          .map((e) => stepIdToKey.get(e.fromStepId))
          .filter((key): key is string => key !== undefined),
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
