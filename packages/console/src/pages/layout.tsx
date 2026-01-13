import { onMount, type ParentProps } from "solid-js"
import { QueryClientProvider } from "@tanstack/solid-query"
import { MetaProvider } from "@solidjs/meta"
import { initSession, initTheme, initVimMode } from "../app"
import { queryClient } from "../app/query-client"

// Re-export for backward compatibility during migration
export { user, setUser, loading, setLoading, activeOrg, setActiveOrg, orgStatus, setOrgStatus, signOut } from "../app"
export { AuthGuard, GuestGuard, OrgGuard } from "../app"

export default function Layout(props: ParentProps) {
  onMount(() => {
    initTheme()
    initVimMode()
    initSession()
  })

  return (
    <MetaProvider>
      <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
    </MetaProvider>
  )
}
