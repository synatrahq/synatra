import { createSignal, Show } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { Buildings, WarningCircle } from "phosphor-solid-js"
import { auth, AuthGuard, activateOrg } from "../app"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { FormField } from "../ui/form-field"

type Status = "idle" | "pending" | "error"

export default function CreateOrganization() {
  const navigate = useNavigate()
  const [name, setName] = createSignal("")
  const [slug, setSlug] = createSignal("")
  const [status, setStatus] = createSignal<Status>("idle")
  const [error, setError] = createSignal("")

  const generateSlug = (value: string) => {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  }

  const handleNameChange = (value: string) => {
    const prevSlug = generateSlug(name())
    setName(value)
    if (!slug() || slug() === prevSlug) {
      setSlug(generateSlug(value))
    }
  }

  const submit = async () => {
    const nameValue = name().trim()
    const slugValue = slug().trim()
    if (!nameValue || !slugValue) return

    setStatus("pending")
    setError("")

    const { data, error: err } = await auth.organization.create({
      name: nameValue,
      slug: slugValue,
    })

    if (err || !data) {
      setStatus("error")
      setError(err?.message ?? "Failed to create organization.")
      return
    }

    await auth.organization.setActive({ organizationId: data.id })
    await activateOrg({ id: data.id, name: data.name, slug: data.slug })
    navigate("/onboarding")
  }

  const canSubmit = () => name().trim() && slug().trim() && status() !== "pending"

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && canSubmit()) submit()
  }

  return (
    <main class="flex min-h-screen items-center justify-center bg-surface p-4">
      <AuthGuard>
        <div class="w-full max-w-[420px] rounded-lg border border-border bg-surface-elevated p-6">
          <div class="mb-4 flex flex-col items-center gap-1.5">
            <div class="flex h-9 w-9 items-center justify-center rounded-md bg-accent-soft text-accent">
              <Buildings size={18} weight="duotone" />
            </div>
            <div class="space-y-0.5 text-center">
              <h1 class="text-sm font-semibold text-text">Create your organization</h1>
              <p class="text-xs text-text-muted">Set up your workspace to get started</p>
            </div>
          </div>

          <div class="space-y-3">
            <FormField label="Organization name" for="org-name">
              <Input
                id="org-name"
                type="text"
                value={name()}
                onInput={(e) => handleNameChange(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                placeholder="Acme Inc."
              />
            </FormField>

            <FormField label="Slug" for="org-slug" description="Used in URLs and identifiers">
              <Input
                id="org-slug"
                type="text"
                value={slug()}
                onInput={(e) => setSlug(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                placeholder="acme-inc"
              />
            </FormField>

            <Button type="button" onClick={submit} disabled={!canSubmit()} class="w-full">
              {status() === "pending" ? "Creating..." : "Create organization"}
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
