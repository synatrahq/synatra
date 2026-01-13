import { createSignal, createMemo } from "solid-js"
import { auth } from "./auth"
import { api } from "./api"
import type { Role, PermissionResource, PermissionAction } from "@synatra/core/permissions"

export type User = { id: string; email: string; name?: string }
export type Organization = { id: string; name: string; slug: string }
export type OrgStatus = "loading" | "none" | "active"

export const [user, setUser] = createSignal<User | null>(null)
export const [loading, setLoading] = createSignal(true)
export const [needsProfile, setNeedsProfile] = createSignal(false)
export const [activeOrg, setActiveOrg] = createSignal<Organization | null>(null)
export const [orgStatus, setOrgStatus] = createSignal<OrgStatus>("loading")
export const [pendingCount, setPendingCount] = createSignal(0)
export const [memberRole, setMemberRole] = createSignal<Role | null>(null)

export async function fetchPendingCount() {
  try {
    const res = await api.api.threads.counts.$get()
    if (res.ok) {
      const data = await res.json()
      const pending = data.byStatus.waiting_human ?? 0
      setPendingCount(pending)
    }
  } catch (e) {
    console.error("Failed to fetch pending count", e)
  }
}

export async function activateOrg(org: Organization) {
  setActiveOrg(org)
  const { data: member } = await auth.organization.getActiveMember()
  if (member?.role) {
    setMemberRole(member.role as Role)
  }
  setOrgStatus("active")
}

export async function initSession() {
  const { data } = await auth.getSession()
  if (data?.user) {
    setUser({ id: data.user.id, email: data.user.email, name: data.user.name ?? undefined })
    setNeedsProfile(!data.user.name)

    const { data: orgs } = await auth.organization.list()
    if (!orgs || orgs.length === 0) {
      setOrgStatus("none")
    } else {
      const { data: session } = await auth.getSession()
      if (session?.session?.activeOrganizationId) {
        const active = orgs.find((o: Organization) => o.id === session.session.activeOrganizationId)
        if (active) {
          await activateOrg(active as Organization)
        } else {
          await auth.organization.setActive({ organizationId: orgs[0].id })
          await activateOrg(orgs[0] as Organization)
        }
      } else {
        await auth.organization.setActive({ organizationId: orgs[0].id })
        await activateOrg(orgs[0] as Organization)
      }
    }
  }
  setLoading(false)
}

export function can<R extends PermissionResource>(resource: R, action: PermissionAction<R>): boolean {
  const role = memberRole()
  if (!role) return false
  return auth.organization.checkRolePermission({
    role,
    permission: { [resource]: [action] },
  })
}

export async function signOut() {
  await auth.signOut()
  setUser(null)
  window.location.href = "/login"
}
