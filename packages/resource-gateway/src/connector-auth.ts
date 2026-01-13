import { verifyConnectorToken, verifyConnectorTokenHash } from "@synatra/core"
import type { ConnectorTokenInfo } from "@synatra/core/types"

export type ConnectorInfo = ConnectorTokenInfo

export { verifyConnectorToken }

export const verifyConnectorStillValid = (connectorId: string, tokenHash: string) =>
  verifyConnectorTokenHash({ connectorId, tokenHash })
