import { createSignal, createEffect, Show, For } from "solid-js"
import type { ResourceType, GitHubMetadata, IntercomMetadata } from "@synatra/core/types"
import { Plus } from "phosphor-solid-js"
import {
  Modal,
  ModalContainer,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Textarea,
  Spinner,
  Select,
  FormField,
} from "../../ui"
import { ResourceIcon, AppIcon } from "../../components"
import { RESOURCE_TYPE_META } from "./types"
import type { AppAccounts } from "../../app/api"

type ResourceCreateModalProps = {
  open: boolean
  onClose: () => void
  onSave: (data: {
    name: string
    slug?: string
    description?: string
    type: ResourceType
    appAccountId?: string
  }) => Promise<void>
  saving?: boolean
  appAccounts?: AppAccounts
  pendingAppAccountId?: string | null
  onAppConnect?: (appId: string) => void
}

function generateSlug(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word, i) => (i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join("")
}

const MAX_DESCRIPTION_LENGTH = 255

export function ResourceCreateModal(props: ResourceCreateModalProps) {
  const [step, setStep] = createSignal<"select-type" | "configure">("select-type")
  const [name, setName] = createSignal("")
  const [slug, setSlug] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [selectedType, setSelectedType] = createSignal<ResourceType>("postgres")
  const [selectedAppAccountId, setSelectedAppAccountId] = createSignal<string | null>(null)
  const [error, setError] = createSignal<string | null>(null)
  const [slugManuallyEdited, setSlugManuallyEdited] = createSignal(false)

  const resourceTypes: { type: ResourceType; available: boolean }[] = [
    { type: "postgres", available: true },
    { type: "mysql", available: true },
    { type: "stripe", available: true },
    { type: "github", available: true },
    { type: "intercom", available: true },
    { type: "restapi", available: true },
  ]

  const githubAccounts = () => props.appAccounts?.filter((a) => a.appId === "github") ?? []
  const intercomAccounts = () => props.appAccounts?.filter((a) => a.appId === "intercom") ?? []

  createEffect(() => {
    if (props.open) {
      setStep("select-type")
      setName("")
      setSlug("")
      setDescription("")
      setSelectedType("postgres")
      setSelectedAppAccountId(null)
      setError(null)
      setSlugManuallyEdited(false)
    }
  })

  createEffect(() => {
    if (!props.open) return
    const pending = props.pendingAppAccountId
    if (pending) {
      const account = props.appAccounts?.find((a) => a.id === pending)
      if (account) {
        if (account.appId === "github") {
          setSelectedType("github")
        } else if (account.appId === "intercom") {
          setSelectedType("intercom")
        }
        setSelectedAppAccountId(pending)
        setStep("configure")
      }
    }
  })

  const handleTypeSelect = (type: ResourceType) => {
    setSelectedType(type)
    setSelectedAppAccountId(null)
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

  const handleSave = async () => {
    if (!name().trim()) {
      setError("Name is required")
      return
    }

    if (selectedType() === "github" && !selectedAppAccountId()) {
      setError("Please select a GitHub connection")
      return
    }

    if (selectedType() === "intercom" && !selectedAppAccountId()) {
      setError("Please select an Intercom connection")
      return
    }

    const needsAppAccount = selectedType() === "github" || selectedType() === "intercom"
    await props.onSave({
      name: name().trim(),
      slug: slug().trim() || undefined,
      description: description().trim() || undefined,
      type: selectedType(),
      appAccountId: needsAppAccount ? (selectedAppAccountId() ?? undefined) : undefined,
    })
  }

  const canCreate = () => {
    if (!name().trim()) return false
    if (selectedType() === "github" && !selectedAppAccountId()) return false
    if (selectedType() === "intercom" && !selectedAppAccountId()) return false
    return true
  }

  return (
    <Modal open={props.open} onBackdropClick={props.onClose} onEscape={props.onClose}>
      <ModalContainer size="lg">
        <ModalHeader
          title="Create resource"
          onClose={props.onClose}
          onBack={step() === "configure" ? handleBack : undefined}
        />

        {/* Type Selection */}
        <Show when={step() === "select-type"}>
          <ModalBody>
            <div class="grid grid-cols-3 gap-3">
              <For each={resourceTypes}>
                {(rt) => {
                  const meta = RESOURCE_TYPE_META[rt.type]
                  return (
                    <button
                      type="button"
                      class="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface-elevated p-4 text-center transition-colors hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => handleTypeSelect(rt.type)}
                      disabled={!rt.available}
                    >
                      <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-muted">
                        <ResourceIcon type={rt.type} class="h-6 w-6" />
                      </div>
                      <span class="text-xs font-medium text-text">{meta?.label ?? rt.type}</span>
                    </button>
                  )
                }}
              </For>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" size="sm" onClick={props.onClose}>
              Cancel
            </Button>
          </ModalFooter>
        </Show>

        {/* Configuration */}
        <Show when={step() === "configure"}>
          <ModalBody>
            <>
              {/* Selected type indicator */}
              <div class="flex items-center gap-2.5">
                <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-muted">
                  <ResourceIcon type={selectedType()} class="h-4 w-4" />
                </div>
                <div class="flex flex-col">
                  <span class="text-xs font-medium text-text">{RESOURCE_TYPE_META[selectedType()]?.label}</span>
                  <span class="text-xs text-text-muted">
                    {selectedType() === "github" || selectedType() === "intercom"
                      ? `Select ${selectedType() === "github" ? "a GitHub" : "an Intercom"} connection`
                      : "Configure connection after creation"}
                  </span>
                </div>
              </div>

              {/* GitHub Connection Select */}
              <Show when={selectedType() === "github"}>
                <FormField label="Connection">
                  <Select
                    value={selectedAppAccountId() ?? ""}
                    options={[
                      ...githubAccounts().map((a) => {
                        const meta = a.metadata as GitHubMetadata | null
                        return {
                          value: a.id,
                          label: meta?.accountLogin ? `${a.name} (${meta.accountLogin})` : a.name,
                          icon: (iconProps: { class?: string }) => <AppIcon appId="github" class={iconProps.class} />,
                        }
                      }),
                      ...(props.onAppConnect
                        ? [
                            {
                              value: "__connect_new__",
                              label: "Connect new",
                              icon: (iconProps: { class?: string }) => <Plus class={iconProps.class} />,
                            },
                          ]
                        : []),
                    ]}
                    onChange={(value) => {
                      if (value === "__connect_new__") {
                        props.onAppConnect?.("github")
                        return
                      }
                      setSelectedAppAccountId(value || null)
                    }}
                    placeholder="Select connection"
                    class="h-8 text-xs"
                  />
                </FormField>
              </Show>

              {/* Intercom Connection Select */}
              <Show when={selectedType() === "intercom"}>
                <FormField label="Connection">
                  <Select
                    value={selectedAppAccountId() ?? ""}
                    options={[
                      ...intercomAccounts().map((a) => {
                        const meta = a.metadata as IntercomMetadata | null
                        return {
                          value: a.id,
                          label: meta?.workspaceName ? `${a.name} (${meta.workspaceName})` : a.name,
                          icon: (iconProps: { class?: string }) => <AppIcon appId="intercom" class={iconProps.class} />,
                        }
                      }),
                      ...(props.onAppConnect
                        ? [
                            {
                              value: "__connect_new__",
                              label: "Connect new",
                              icon: (iconProps: { class?: string }) => <Plus class={iconProps.class} />,
                            },
                          ]
                        : []),
                    ]}
                    onChange={(value) => {
                      if (value === "__connect_new__") {
                        props.onAppConnect?.("intercom")
                        return
                      }
                      setSelectedAppAccountId(value || null)
                    }}
                    placeholder="Select connection"
                    class="h-8 text-xs"
                  />
                </FormField>
              </Show>

              {/* Name and Slug */}
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

              {/* Description */}
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

              {/* Error */}
              <Show when={error()}>
                <div class="rounded-md border border-danger bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
                  {error()}
                </div>
              </Show>
            </>
          </ModalBody>
          <ModalFooter>
            <>
              <Button variant="ghost" size="sm" onClick={props.onClose}>
                Cancel
              </Button>
              <Button variant="default" size="sm" onClick={handleSave} disabled={props.saving || !canCreate()}>
                {props.saving && <Spinner size="xs" class="border-white border-t-transparent" />}
                {props.saving ? "Creating..." : "Create"}
              </Button>
            </>
          </ModalFooter>
        </Show>
      </ModalContainer>
    </Modal>
  )
}
