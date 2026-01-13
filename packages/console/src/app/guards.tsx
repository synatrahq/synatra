import { createEffect, Show, type ParentProps, type JSX } from "solid-js"
import { useNavigate, useLocation } from "@solidjs/router"
import { SpinnerGap } from "phosphor-solid-js"
import { user, loading, orgStatus, needsProfile, memberRole } from "./session"

function Card(props: ParentProps) {
  return (
    <div class="w-full max-w-[420px] rounded-lg border border-border bg-surface-elevated p-6">{props.children}</div>
  )
}

function FullPageLoader() {
  return (
    <div class="flex min-h-screen items-center justify-center bg-surface">
      <SpinnerGap class="h-5 w-5 animate-spin text-text-muted" />
    </div>
  )
}

export function AuthGuard(props: ParentProps) {
  const navigate = useNavigate()
  const location = useLocation()

  createEffect(() => {
    if (loading()) return

    if (!user()) {
      navigate("/login", { replace: true })
      return
    }

    if (needsProfile() && location.pathname !== "/setup-profile") {
      const returnTo = encodeURIComponent(location.pathname + location.search)
      navigate(`/setup-profile?returnTo=${returnTo}`, { replace: true })
    }
  })

  return (
    <Show when={!loading() && user()} fallback={<FullPageLoader />}>
      {props.children}
    </Show>
  )
}

export function GuestGuard(props: ParentProps) {
  const navigate = useNavigate()

  createEffect(() => {
    if (loading()) return
    if (!user()) return
    if (needsProfile()) {
      navigate("/setup-profile", { replace: true })
      return
    }
    navigate("/inbox", { replace: true })
  })

  return (
    <Show
      when={!loading() && !user()}
      fallback={
        <Card>
          <SpinnerGap class="mx-auto h-4 w-4 animate-spin text-text-muted" />
        </Card>
      }
    >
      <Card>{props.children}</Card>
    </Show>
  )
}

export function OrgGuard(props: ParentProps<{ fallback?: JSX.Element }>) {
  const navigate = useNavigate()

  createEffect(() => {
    if (loading()) return

    if (!user()) {
      navigate("/login", { replace: true })
      return
    }

    if (needsProfile() || orgStatus() === "none") {
      navigate("/setup-profile", { replace: true })
      return
    }
  })

  const canShowFallback = () => !loading() && user() && !needsProfile()
  const isReady = () => canShowFallback() && orgStatus() === "active"

  return (
    <Show when={isReady()} fallback={canShowFallback() ? (props.fallback ?? <FullPageLoader />) : <FullPageLoader />}>
      {props.children}
    </Show>
  )
}

export function AdminGuard(props: ParentProps<{ fallback?: JSX.Element }>) {
  const navigate = useNavigate()

  createEffect(() => {
    if (loading()) return

    if (!user()) {
      navigate("/login", { replace: true })
      return
    }

    if (needsProfile() || orgStatus() === "none") {
      navigate("/setup-profile", { replace: true })
      return
    }

    if (orgStatus() !== "active") return

    const role = memberRole()
    if (role !== "owner" && role !== "admin") {
      navigate("/inbox", { replace: true })
    }
  })

  const isReady = () => {
    const role = memberRole()
    return !loading() && user() && !needsProfile() && orgStatus() === "active" && (role === "owner" || role === "admin")
  }

  return (
    <Show when={isReady()} fallback={<FullPageLoader />}>
      {props.children}
    </Show>
  )
}

export function BuilderGuard(props: ParentProps<{ fallback?: JSX.Element }>) {
  const navigate = useNavigate()

  createEffect(() => {
    if (loading()) return

    if (!user()) {
      navigate("/login", { replace: true })
      return
    }

    if (needsProfile() || orgStatus() === "none") {
      navigate("/setup-profile", { replace: true })
      return
    }

    if (orgStatus() !== "active") return

    const role = memberRole()
    if (!role || role === "member") {
      navigate("/inbox", { replace: true })
    }
  })

  const isReady = () => {
    const role = memberRole()
    return (
      !loading() &&
      user() &&
      !needsProfile() &&
      orgStatus() === "active" &&
      (role === "owner" || role === "admin" || role === "builder")
    )
  }

  return (
    <Show when={isReady()} fallback={<FullPageLoader />}>
      {props.children}
    </Show>
  )
}
