import { z } from "zod"

export const ConnectorStatus = ["online", "offline", "error"] as const
export type ConnectorStatus = (typeof ConnectorStatus)[number]

export const ConnectorMetadataSchema = z.object({
  version: z.string().optional(),
  platform: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
})
export type ConnectorMetadata = z.infer<typeof ConnectorMetadataSchema>

export type ConnectorTokenInfo = {
  id: string
  organizationId: string
  name: string
  tokenHash: string
}
