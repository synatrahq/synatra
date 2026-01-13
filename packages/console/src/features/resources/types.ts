import type { ResourceType } from "@synatra/core/types"

export const RESOURCE_TYPE_META: Record<ResourceType, { label: string }> = {
  postgres: { label: "PostgreSQL" },
  mysql: { label: "MySQL" },
  stripe: { label: "Stripe" },
  github: { label: "GitHub" },
  intercom: { label: "Intercom" },
  restapi: { label: "REST API" },
  synatra_ai: { label: "Synatra AI" },
}
