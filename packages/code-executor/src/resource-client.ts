import { loadConfig, createResourceGateway, type QueryOperation } from "@synatra/service-call"
import type { UserConfigurableResourceType } from "@synatra/core/types"

export type { UserConfigurableResourceType, QueryOperation }

export type ResourceMapping = {
  name: string
  resourceId: string
  type: UserConfigurableResourceType
}

export type ResourceClient = {
  query: (resourceName: string, operation: QueryOperation) => Promise<unknown>
  getResources: () => ResourceMapping[]
}

const config = loadConfig("code-executor")
const gateway = createResourceGateway(config)

export function createResourceClient(
  organizationId: string,
  resources: ResourceMapping[],
  environmentId: string,
): ResourceClient {
  return {
    async query(resourceName, operation) {
      const mapping = resources.find((r) => r.name === resourceName)
      if (!mapping) {
        throw new Error(`Resource "${resourceName}" not found`)
      }

      const result = await gateway.query(organizationId, mapping.resourceId, environmentId, operation)
      if (!result.ok) {
        throw new Error(result.error)
      }

      if (!result.data.success) {
        throw new Error(result.data.error ?? "Query failed")
      }

      return result.data.data
    },
    getResources() {
      return resources
    },
  }
}
