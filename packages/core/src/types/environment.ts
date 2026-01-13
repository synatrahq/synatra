export const EnvironmentProtectedSlugs = ["production", "staging"] as const
export type EnvironmentProtectedSlug = (typeof EnvironmentProtectedSlugs)[number]

export const EnvironmentColorPalette = [
  "#EF4444",
  "#F97316",
  "#F59E0B",
  "#EAB308",
  "#84CC16",
  "#22C55E",
  "#10B981",
  "#14B8A6",
  "#06B6D4",
  "#0EA5E9",
  "#3B82F6",
  "#6366F1",
  "#8B5CF6",
  "#A855F7",
  "#D946EF",
  "#EC4899",
] as const

export const EnvironmentColorRegex = /^#[0-9A-Fa-f]{6}$/

export type DefaultEnvironment = {
  name: string
  slug: string
  color: string
  isProtected: boolean
}

export const PRODUCTION_ENV: DefaultEnvironment = {
  name: "Production",
  slug: "production",
  color: "#3B82F6",
  isProtected: true,
}

export const STAGING_ENV: DefaultEnvironment = {
  name: "Staging",
  slug: "staging",
  color: "#22C55E",
  isProtected: true,
}
