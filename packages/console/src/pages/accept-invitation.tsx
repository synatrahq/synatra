import { createSignal, onMount, Show } from "solid-js"
import { useParams, useNavigate, useSearchParams } from "@solidjs/router"
import { auth, initSession } from "../app"
import { Spinner } from "../ui"

export default function AcceptInvitation() {
  const params = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = createSignal<"loading" | "success" | "error" | "not-found">("loading")
  const [error, setError] = createSignal("")

  onMount(async () => {
    const { data: session } = await auth.getSession()
    if (!session?.user) {
      const returnUrl = encodeURIComponent(`/accept-invitation/${params.id}`)
      const email = searchParams.email ? encodeURIComponent(String(searchParams.email)) : ""
      const org = searchParams.org ? encodeURIComponent(String(searchParams.org)) : ""
      const loginParams = [`returnTo=${returnUrl}`]
      if (email) loginParams.push(`email=${email}`)
      if (org) loginParams.push(`org=${org}`)
      navigate(`/login?${loginParams.join("&")}`, { replace: true })
      return
    }

    const { data: invitation, error: invErr } = await auth.organization.getInvitation({ query: { id: params.id } })
    if (invErr || !invitation) {
      setStatus("not-found")
      return
    }

    const { error: acceptErr } = await auth.organization.acceptInvitation({ invitationId: params.id })
    if (acceptErr) {
      setError(acceptErr.message || "Failed to accept invitation")
      setStatus("error")
      return
    }

    await auth.organization.setActive({ organizationId: invitation.organizationId })
    await initSession()
    setStatus("success")
    setTimeout(() => navigate("/", { replace: true }), 1500)
  })

  return (
    <div class="flex min-h-screen items-center justify-center bg-surface">
      <div class="w-full max-w-sm rounded-lg border border-border bg-surface-elevated p-6 text-center">
        <Show when={status() === "loading"}>
          <Spinner size="lg" />
          <p class="mt-4 text-sm text-text-muted">Accepting invitation...</p>
        </Show>

        <Show when={status() === "success"}>
          <div class="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-success-soft">
            <svg class="h-6 w-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 class="mt-4 text-lg font-semibold text-text">Invitation Accepted</h2>
          <p class="mt-1 text-sm text-text-muted">Redirecting to dashboard...</p>
        </Show>

        <Show when={status() === "not-found"}>
          <div class="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-warning-soft">
            <svg class="h-6 w-6 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 class="mt-4 text-lg font-semibold text-text">Invitation Not Found</h2>
          <p class="mt-1 text-sm text-text-muted">This invitation may have expired or been canceled.</p>
          <button
            class="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
            onClick={() => navigate("/", { replace: true })}
          >
            Go to Dashboard
          </button>
        </Show>

        <Show when={status() === "error"}>
          <div class="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-danger-soft">
            <svg class="h-6 w-6 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 class="mt-4 text-lg font-semibold text-text">Failed to Accept</h2>
          <p class="mt-1 text-sm text-text-muted">{error()}</p>
          <button
            class="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
            onClick={() => navigate("/", { replace: true })}
          >
            Go to Dashboard
          </button>
        </Show>
      </div>
    </div>
  )
}
