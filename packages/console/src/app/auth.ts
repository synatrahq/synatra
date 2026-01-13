import { createAuthClient } from "better-auth/client"
import { magicLinkClient, organizationClient } from "better-auth/client/plugins"
import { ac, ownerRole, adminRole, builderRole, memberRole } from "@synatra/core/permissions"
import { apiBaseURL } from "./api"

const roles = {
  owner: ownerRole,
  admin: adminRole,
  builder: builderRole,
  member: memberRole,
}

export const auth = createAuthClient({
  baseURL: apiBaseURL,
  plugins: [magicLinkClient(), organizationClient({ ac, roles })],
})
