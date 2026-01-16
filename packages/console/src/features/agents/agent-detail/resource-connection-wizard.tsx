import { createSignal, createEffect, createResource, Show, For } from "solid-js"
import { UserConfigurableResourceType, isManagedResourceType } from "@synatra/core/types"
import { generateSlug } from "@synatra/util/identifier"
import { Button, Input, Textarea, Spinner, Label, FormField } from "../../../ui"
import { ResourceIcon } from "../../../components"
import { CheckCircle } from "phosphor-solid-js"
import type { CopilotResourceRequest } from "./copilot-panel/types"
import { RESOURCE_TYPE_META } from "../../resources/types"
import { api } from "../../../app"

type ConfirmingResource = {
  requestId: string
  resourceId: string
}

type ResourceConnectionWizardProps = {
  request?: CopilotResourceRequest | null
  confirmingResource?: ConfirmingResource | null
  onComplete: (data: {
    name: string
    slug?: string
    description?: string
    type: UserConfigurableResourceType
  }) => Promise<{ resourceId: string }>
  onConfirmationComplete?: (requestId: string, resourceId: string) => Promise<void>
  onCancel: () => void
  saving?: boolean
}

const MAX_DESCRIPTION_LENGTH = 255

export function ResourceConnectionWizard(props: ResourceConnectionWizardProps) {
  const [step, setStep] = createSignal<"select-type" | "configure" | "confirmation">("select-type")
  const [name, setName] = createSignal("")
  const [slug, setSlug] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [selectedType, setSelectedType] = createSignal<UserConfigurableResourceType | null>(null)
  const [error, setError] = createSignal<string | null>(null)
  const [slugManuallyEdited, setSlugManuallyEdited] = createSignal(false)
  const [completing, setCompleting] = createSignal(false)

  const [confirmResource] = createResource(
    () => props.confirmingResource?.resourceId,
    async (id) => {
      const res = await api.api.resources[":id"].$get({ param: { id } })
      if (!res.ok) throw new Error("Failed to fetch resource")
      return res.json()
    },
  )

  const allTypes = [...UserConfigurableResourceType]
  const isUserConfigurable = (t: string): t is UserConfigurableResourceType => !isManagedResourceType(t)
  const suggestedTypes = (): UserConfigurableResourceType[] =>
    props.request?.suggestions.map((s) => s.type).filter(isUserConfigurable) ?? []

  const getSuggestionReason = (type: UserConfigurableResourceType) => {
    const suggestion = props.request?.suggestions.find((s) => s.type === type)
    return suggestion?.reason
  }

  createEffect(() => {
    if (props.confirmingResource) {
      setStep("confirmation")
    } else {
      setStep("select-type")
      setName("")
      setSlug("")
      setDescription("")
      setSelectedType(null)
      setError(null)
      setSlugManuallyEdited(false)
    }
  })

  const handleTypeSelect = (type: UserConfigurableResourceType) => {
    setSelectedType(type)
    setStep("configure")
  }

  const handleNameChange = (value: string) => {
    setName(value)
    if (!slugManuallyEdited()) {
      setSlug(generateSlug(value))
    }
  }

  const handleSlugChange = (value: string) => {
    setSlugManuallyEdited(true)
    setSlug(value)
  }

  const handleDescriptionChange = (value: string) => {
    if (value.length <= MAX_DESCRIPTION_LENGTH) {
      setDescription(value)
    }
  }

  const handleBack = () => {
    setStep("select-type")
    setError(null)
  }

  const handleComplete = async () => {
    const type = selectedType()
    if (!type) return

    if (!name().trim()) {
      setError("Name is required")
      return
    }

    await props.onComplete({
      name: name().trim(),
      slug: slug().trim() || undefined,
      description: description().trim() || undefined,
      type,
    })
  }

  const canCreate = () => !!selectedType() && !!name().trim()

  const handleConfirmationComplete = async () => {
    const confirm = props.confirmingResource
    if (!confirm || !props.onConfirmationComplete) return
    setCompleting(true)
    try {
      await props.onConfirmationComplete(confirm.requestId, confirm.resourceId)
    } finally {
      setCompleting(false)
    }
  }

  return (
    <div class="flex h-full flex-col">
      <div class="border-b border-border px-3 py-2">
        <h2 class="text-xs font-medium text-text">
          {step() === "confirmation" ? "Resource Connected" : "Connect Resource"}
        </h2>
        <Show when={step() !== "confirmation" && props.request}>
          <p class="mt-0.5 text-2xs text-text-muted">{props.request!.explanation}</p>
        </Show>
      </div>

      <div class="flex-1 overflow-y-auto p-3 scrollbar-thin">
        <Show when={step() === "select-type"}>
          <div class="space-y-4">
            <Show when={suggestedTypes().length > 0}>
              <div>
                <Label class="mb-2 block text-xs">Suggested</Label>
                <div class="space-y-2">
                  <For each={suggestedTypes()}>
                    {(type) => {
                      const meta = RESOURCE_TYPE_META[type]
                      const reason = getSuggestionReason(type)
                      return (
                        <button
                          type="button"
                          class="flex w-full items-start gap-3 rounded-lg border border-border bg-surface-elevated p-3 text-left transition-colors hover:border-border-strong hover:bg-surface-muted"
                          onClick={() => handleTypeSelect(type)}
                        >
                          <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/10">
                            <ResourceIcon type={type} class="h-4 w-4 text-accent" />
                          </div>
                          <div class="min-w-0 flex-1">
                            <div class="text-xs font-medium text-text">{meta?.label ?? type}</div>
                            <Show when={reason}>
                              <div class="mt-0.5 text-2xs text-text-muted">{reason}</div>
                            </Show>
                          </div>
                        </button>
                      )
                    }}
                  </For>
                </div>
              </div>
            </Show>

            <div>
              <Label class="mb-2 block text-xs text-text-muted">Other types</Label>
              <div class="flex flex-wrap gap-1.5">
                <For each={allTypes.filter((t) => !suggestedTypes().includes(t))}>
                  {(type) => {
                    const meta = RESOURCE_TYPE_META[type]
                    return (
                      <button
                        type="button"
                        class="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-left transition-colors hover:border-border-strong hover:bg-surface-elevated"
                        onClick={() => handleTypeSelect(type)}
                      >
                        <ResourceIcon type={type} class="h-3.5 w-3.5 text-text-muted" />
                        <span class="text-2xs text-text">{meta?.label ?? type}</span>
                      </button>
                    )
                  }}
                </For>
              </div>
            </div>
          </div>
        </Show>

        <Show when={step() === "configure" && selectedType()}>
          <div class="space-y-3">
            <button type="button" class="text-xs text-text-muted hover:text-text" onClick={handleBack}>
              ← Back
            </button>

            <div class="flex items-center gap-2.5">
              <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-muted">
                <ResourceIcon type={selectedType()!} class="h-4 w-4" />
              </div>
              <div class="flex flex-col">
                <span class="text-xs font-medium text-text">{RESOURCE_TYPE_META[selectedType()!]?.label}</span>
                <span class="text-2xs text-text-muted">Configure connection after creation</span>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <FormField label="Name" for="resource-name">
                <Input
                  id="resource-name"
                  type="text"
                  value={name()}
                  onInput={(e) => handleNameChange(e.currentTarget.value)}
                  placeholder="Main Database"
                  class="h-8 text-xs"
                />
              </FormField>
              <FormField label="Slug (optional)" for="resource-slug">
                <Input
                  id="resource-slug"
                  type="text"
                  value={slug()}
                  onInput={(e) => handleSlugChange(e.currentTarget.value)}
                  placeholder="mainDatabase"
                  class="h-8 font-code text-xs"
                />
              </FormField>
            </div>

            <FormField label="Description (optional)" for="resource-desc">
              <Textarea
                id="resource-desc"
                value={description()}
                onInput={(e) => handleDescriptionChange(e.currentTarget.value)}
                placeholder="Primary production database"
                rows={2}
              />
              <span class="block text-right text-[10px] text-text-muted">
                {description().length}/{MAX_DESCRIPTION_LENGTH}
              </span>
            </FormField>

            <Show when={error()}>
              <div class="rounded-md border border-danger bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
                {error()}
              </div>
            </Show>
          </div>
        </Show>

        <Show when={step() === "confirmation"}>
          <Show
            when={!confirmResource.loading && confirmResource()}
            fallback={
              <div class="flex h-full items-center justify-center">
                <Spinner size="sm" />
              </div>
            }
          >
            {(r) => (
              <div class="space-y-4 p-1">
                <div class="flex items-center justify-center">
                  <div class="rounded-full bg-success/10 p-3">
                    <CheckCircle class="h-8 w-8 text-success" weight="duotone" />
                  </div>
                </div>

                <div class="text-center">
                  <h3 class="text-sm font-medium text-text">Resource Successfully Connected</h3>
                  <p class="mt-1 text-xs text-text-muted">Your resource has been created and is ready to use</p>
                </div>

                <div class="space-y-2.5 rounded-lg border border-border bg-surface p-3">
                  <div class="flex items-center gap-2.5">
                    <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-muted">
                      <ResourceIcon type={r().type} class="h-5 w-5" />
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="truncate text-sm font-medium text-text">{r().name}</div>
                      <div class="text-xs text-text-muted">{RESOURCE_TYPE_META[r().type]?.label ?? r().type}</div>
                    </div>
                  </div>

                  <div class="rounded bg-surface-muted px-2 py-1.5">
                    <div class="text-2xs text-text-muted">Slug</div>
                    <div class="font-code text-xs text-text">{r().slug}</div>
                  </div>

                  <Show when={r().description}>
                    <div class="text-xs text-text-muted">{r().description}</div>
                  </Show>
                </div>

                <div class="rounded-lg border border-accent/30 bg-accent/5 p-3">
                  <p class="text-xs text-text-muted">
                    Click <strong class="text-text">Continue</strong> to return to the Copilot conversation. The agent
                    will now have access to this resource.
                  </p>
                </div>
              </div>
            )}
          </Show>
        </Show>
      </div>

      <div class="flex justify-end gap-2 border-t border-border px-3 py-2">
        <Show when={step() === "select-type"}>
          <Button variant="ghost" size="sm" onClick={props.onCancel}>
            Cancel
          </Button>
        </Show>
        <Show when={step() === "configure"}>
          <Button variant="default" size="sm" onClick={handleComplete} disabled={props.saving || !canCreate()}>
            {props.saving && <Spinner size="xs" class="border-white border-t-transparent" />}
            {props.saving ? "Creating..." : "Create & Connect"}
          </Button>
        </Show>
        <Show when={step() === "confirmation"}>
          <Button
            variant="default"
            size="sm"
            onClick={handleConfirmationComplete}
            disabled={completing() || confirmResource.loading}
          >
            {completing() && <Spinner size="xs" class="border-white border-t-transparent" />}
            {completing() ? "Continuing..." : "Continue"}
          </Button>
        </Show>
      </div>
    </div>
  )
}
