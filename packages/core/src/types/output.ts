export const OutputKind = ["table", "chart", "markdown", "key_value"] as const
export type OutputKind = (typeof OutputKind)[number]
