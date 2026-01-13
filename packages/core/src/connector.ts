import { z } from "zod"
import { eq, and } from "drizzle-orm"
import { createHash, randomBytes } from "crypto"
import { principal } from "./principal"
import { withDb, first } from "./database"
import { ConnectorTable } from "./schema/connector.sql"
import type { ConnectorTokenInfo } from "./types"

export const CreateConnectorSchema = z.object({
  name: z.string().min(1),
})

export const VerifyConnectorTokenHashSchema = z.object({ connectorId: z.string(), tokenHash: z.string() })

export const SetConnectorStatusSchema = z.object({
  connectorId: z.string(),
  status: z.enum(["online", "offline", "error"]),
})

export const SetConnectorMetadataSchema = z.object({
  connectorId: z.string(),
  metadata: z.object({
    version: z.string().optional(),
    platform: z.string().optional(),
    capabilities: z.array(z.string()).optional(),
  }),
})

function generateToken(): string {
  return `conn_${randomBytes(32).toString("hex")}`
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export async function listConnectors() {
  const organizationId = principal.orgId()
  return withDb((db) => db.select().from(ConnectorTable).where(eq(ConnectorTable.organizationId, organizationId)))
}

export async function findConnectorById(id: string) {
  return withDb((db) => db.select().from(ConnectorTable).where(eq(ConnectorTable.id, id)).then(first))
}

export async function findConnectorByToken(token: string) {
  const tokenHash = hashToken(token)
  return withDb((db) => db.select().from(ConnectorTable).where(eq(ConnectorTable.tokenHash, tokenHash)).then(first))
}

export async function createConnector(input: z.input<typeof CreateConnectorSchema>) {
  const data = CreateConnectorSchema.parse(input)
  const organizationId = principal.orgId()
  const userId = principal.userId()
  const token = generateToken()
  const tokenHash = hashToken(token)

  const [connector] = await withDb((db) =>
    db
      .insert(ConnectorTable)
      .values({
        organizationId,
        name: data.name,
        tokenHash,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning(),
  )

  return { connector, token }
}

export async function regenerateConnectorToken(id: string) {
  const organizationId = principal.orgId()
  const userId = principal.userId()
  const token = generateToken()
  const tokenHash = hashToken(token)

  const [connector] = await withDb((db) =>
    db
      .update(ConnectorTable)
      .set({
        tokenHash,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(and(eq(ConnectorTable.id, id), eq(ConnectorTable.organizationId, organizationId)))
      .returning(),
  )

  if (!connector) return null
  return { connector, token }
}

export async function removeConnector(id: string) {
  const organizationId = principal.orgId()
  const [deleted] = await withDb((db) =>
    db
      .delete(ConnectorTable)
      .where(and(eq(ConnectorTable.id, id), eq(ConnectorTable.organizationId, organizationId)))
      .returning({ id: ConnectorTable.id }),
  )
  return deleted
}

export async function verifyConnectorToken(token: string): Promise<ConnectorTokenInfo | null> {
  if (!token || !token.startsWith("conn_")) return null
  const tokenHash = hashToken(token)
  const connector = await withDb((db) =>
    db
      .select({
        id: ConnectorTable.id,
        organizationId: ConnectorTable.organizationId,
        name: ConnectorTable.name,
        tokenHash: ConnectorTable.tokenHash,
      })
      .from(ConnectorTable)
      .where(eq(ConnectorTable.tokenHash, tokenHash))
      .then(first),
  )
  return connector ?? null
}

export async function verifyConnectorTokenHash(
  input: z.input<typeof VerifyConnectorTokenHashSchema>,
): Promise<boolean> {
  const data = VerifyConnectorTokenHashSchema.parse(input)
  const connector = await withDb((db) =>
    db
      .select({ tokenHash: ConnectorTable.tokenHash })
      .from(ConnectorTable)
      .where(eq(ConnectorTable.id, data.connectorId))
      .then(first),
  )
  return connector?.tokenHash === data.tokenHash
}

export async function setConnectorStatus(input: z.input<typeof SetConnectorStatusSchema>): Promise<void> {
  const data = SetConnectorStatusSchema.parse(input)
  const organizationId = principal.orgId()

  const updateData: Record<string, unknown> = {
    status: data.status,
    updatedAt: new Date(),
  }
  if (data.status === "online") {
    updateData.lastSeenAt = new Date()
  }
  await withDb((db) =>
    db
      .update(ConnectorTable)
      .set(updateData)
      .where(and(eq(ConnectorTable.id, data.connectorId), eq(ConnectorTable.organizationId, organizationId))),
  )
}

export async function setConnectorLastSeen(connectorId: string): Promise<void> {
  const organizationId = principal.orgId()

  await withDb((db) =>
    db
      .update(ConnectorTable)
      .set({ lastSeenAt: new Date() })
      .where(and(eq(ConnectorTable.id, connectorId), eq(ConnectorTable.organizationId, organizationId))),
  )
}

export async function setConnectorMetadata(input: z.input<typeof SetConnectorMetadataSchema>): Promise<void> {
  const data = SetConnectorMetadataSchema.parse(input)
  await withDb((db) =>
    db
      .update(ConnectorTable)
      .set({ metadata: data.metadata, updatedAt: new Date() })
      .where(eq(ConnectorTable.id, data.connectorId)),
  )
}
