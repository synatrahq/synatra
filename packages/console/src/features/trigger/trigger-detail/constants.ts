export type Selection = { type: "settings" } | { type: "environment"; environmentId: string } | { type: "prompt" }

export type SaveStatus = "idle" | "saving" | "saved" | "error"

export function getSelectionKey(selection: Selection): string {
  if (selection.type === "environment") return `env-${selection.environmentId}`
  return selection.type
}
