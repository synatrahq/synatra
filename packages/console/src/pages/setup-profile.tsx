import { createSignal, Show, createEffect } from "solid-js"
import { useNavigate, useSearchParams } from "@solidjs/router"
import { Sparkle, WarningCircle } from "phosphor-solid-js"
import { generateSlug } from "@synatra/util/identifier"
import { api, auth, AuthGuard, setUser, setNeedsProfile, user, orgStatus, needsProfile, activateOrg } from "../app"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { FormField } from "../ui/form-field"

type Status = "idle" | "pending" | "error"

function decode(value: string | undefined): string | undefined {
  if (!value) return value
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export default function SetupProfile() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [name, setName] = createSignal("")
  const [orgName, setOrgName] = createSignal("")
  const [orgSlug, setOrgSlug] = createSignal("")
  const [status, setStatus] = createSignal<Status>("idle")
  const [error, setError] = createSignal("")

  const showNameField = () => needsProfile()
  const showOrgField = () => orgStatus() === "none"

  createEffect(() => {
    if (!showNameField() && !showOrgField()) {
      const returnTo = decode(searchParams.returnTo as string | undefined)
      navigate(returnTo ?? "/", { replace: true })
    }
  })

  const handleOrgNameChange = (value: string) => {
    const prevSlug = generateSlug(orgName())
    setOrgName(value)
    if (!orgSlug() || orgSlug() === prevSlug) {
      setOrgSlug(generateSlug(value))
    }
  }

  const submit = async () => {
    if (showNameField() && !name().trim()) return
    if (showOrgField() && (!orgName().trim() || !orgSlug().trim())) return

    setStatus("pending")
    setError("")

    try {
      if (showNameField()) {
        const res = await api.api.user.me.$patch({
          json: { name: name().trim() },
        })
        if (!res.ok) throw new Error("Failed to update profile")

        const current = user()
        if (current) {
          setUser({ ...current, name: name().trim() })
        }
        setNeedsProfile(false)
      }

      if (showOrgField()) {
        const { data, error: err } = await auth.organization.create({
          name: orgName().trim(),
          slug: orgSlug().trim(),
        })
        if (err || !data) throw new Error(err?.message ?? "Failed to create organization")

        await auth.organization.setActive({ organizationId: data.id })
        await activateOrg({ id: data.id, name: data.name, slug: data.slug })
        navigate("/onboarding")
        return
      }

      const returnTo = decode(searchParams.returnTo as string | undefined)
      navigate(returnTo ?? "/", { replace: true })
    } catch (e) {
      setStatus("error")
      setError(e instanceof Error ? e.message : "Something went wrong")
    }
  }

  const canSubmit = () => {
    if (status() === "pending") return false
    if (showNameField() && !name().trim()) return false
    if (showOrgField() && (!orgName().trim() || !orgSlug().trim())) return false
    return true
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && canSubmit()) submit()
  }

  return (
    <main class="flex min-h-screen items-center justify-center bg-surface p-4">
      <AuthGuard>
        <div class="w-full max-w-[420px] rounded-lg border border-border bg-surface-elevated p-6">
          <div class="mb-4 flex flex-col items-center gap-1.5">
            <div class="flex h-9 w-9 items-center justify-center rounded-md bg-accent-soft text-accent">
              <Sparkle size={18} weight="duotone" />
            </div>
            <div class="space-y-0.5 text-center">
              <h1 class="text-sm font-semibold text-text">Welcome to Synatra</h1>
              <p class="text-xs text-text-muted">Let's get you set up</p>
            </div>
          </div>

          <div class="space-y-3">
            <Show when={showNameField()}>
              <FormField label="Your name" for="name">
                <Input
                  id="name"
                  type="text"
                  value={name()}
                  onInput={(e) => setName(e.currentTarget.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="John Doe"
                  autocomplete="name"
                />
              </FormField>
            </Show>

            <Show when={showOrgField()}>
              <FormField label="Organization name" for="org-name">
                <Input
                  id="org-name"
                  type="text"
                  value={orgName()}
                  onInput={(e) => handleOrgNameChange(e.currentTarget.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Acme Inc."
                />
              </FormField>

              <FormField label="Slug" for="org-slug" description="Used in URLs and identifiers">
                <Input
                  id="org-slug"
                  type="text"
                  value={orgSlug()}
                  onInput={(e) => setOrgSlug(e.currentTarget.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="acme-inc"
                />
              </FormField>
            </Show>

            <Button type="button" onClick={submit} disabled={!canSubmit()} class="w-full">
              {status() === "pending" ? "Setting up..." : "Continue"}
            </Button>
          </div>

          <Show when={error()}>
            <div class="mt-3 flex items-start gap-2 rounded-lg bg-danger-soft p-2">
              <WarningCircle size={14} weight="fill" class="mt-0.5 shrink-0 text-danger" />
              <p class="text-xs text-danger">{error()}</p>
            </div>
          </Show>
        </div>
      </AuthGuard>
    </main>
  )
}
