export function parseVersion(version: string) {
  const parts = version.split(".")
  if (parts.length !== 3) throw new Error("Invalid version format. Use x.y.z")
  const [major, minor, patch] = parts.map((p) => Number(p))
  if ([major, minor, patch].some((n) => Number.isNaN(n) || n < 0)) {
    throw new Error("Version numbers must be non-negative integers")
  }
  return { major, minor, patch }
}

export function stringifyVersion(v: { major: number; minor: number; patch: number }) {
  return `${v.major}.${v.minor}.${v.patch}`
}

export function bumpVersion(
  latest: { major: number; minor: number; patch: number } | null,
  type: "major" | "minor" | "patch",
) {
  if (!latest) {
    if (type === "major") return { major: 1, minor: 0, patch: 0 }
    if (type === "minor") return { major: 0, minor: 1, patch: 0 }
    return { major: 0, minor: 0, patch: 1 }
  }
  if (type === "major") return { major: latest.major + 1, minor: 0, patch: 0 }
  if (type === "minor") return { major: latest.major, minor: latest.minor + 1, patch: 0 }
  return { major: latest.major, minor: latest.minor, patch: latest.patch + 1 }
}
