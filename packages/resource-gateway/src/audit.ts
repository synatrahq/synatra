import type { AuditEntry } from "./types"

export async function write(entry: AuditEntry): Promise<void> {
  // TODO: Write to persistent storage (PostgreSQL, CloudWatch, etc.)
  console.log("[AUDIT]", JSON.stringify(entry))
}

export async function query(filter: {
  resourceId?: string
  environmentId?: string
  startTime?: Date
  endTime?: Date
  limit?: number
}): Promise<AuditEntry[]> {
  // TODO: Query from persistent storage
  console.log("[AUDIT] Query:", filter)
  return []
}
