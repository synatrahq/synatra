import { createSignal, createEffect, createResource, createMemo, Show, For, onCleanup } from "solid-js"
import type { AgentRuntimeConfig, AgentTemplate, TemplateCategory } from "@synatra/core/types"
import type { SubscriptionPlan } from "@synatra/core/types"
import { api } from "../../app"
import { Modal, ModalContainer, ModalHeader, ModalBody, ModalFooter, Button, Input, Textarea, Spinner } from "../../ui"
import {
  IconPicker,
  getIconComponent,
  ICON_COLORS,
  EntityIcon,
  ResourceIcon,
  type IconColor,
  UpgradePrompt,
  LimitBadge,
} from "../../components"
import {
  Sparkle,
  Headset,
  ChartBar,
  Gear,
  CurrencyDollar,
  ShieldCheck,
  GitBranch,
  SquaresFour,
  CaretLeft,
  X,
} from "phosphor-solid-js"
import { DemoPreview } from "../onboarding/demo-preview"
import { checkAgentLimit } from "../../utils/subscription-limits"
import { useSubscription } from "../../utils/subscription"

type AgentCreateModalProps = {
  open: boolean
  onClose: () => void
  onSave: (data: {
    name: string
    slug: string
    description: string
    icon: string
    iconColor: IconColor
    templateId?: string
    runtimeConfig: AgentRuntimeConfig
  }) => Promise<void>
  saving?: boolean
  currentAgentCount: number
}

type Step = "select-template" | "configure"

type CategoryOption = "all" | TemplateCategory

const CATEGORY_CONFIG: Record<CategoryOption, { label: string; icon: typeof Headset }> = {
  all: { label: "All", icon: SquaresFour },
  support: { label: "Support", icon: Headset },
  analytics: { label: "Analytics", icon: ChartBar },
  devops: { label: "DevOps", icon: Gear },
  finance: { label: "Finance", icon: CurrencyDollar },
  compliance: { label: "Compliance", icon: ShieldCheck },
  workflow: { label: "Workflow", icon: GitBranch },
}

const CATEGORY_ORDER: CategoryOption[] = ["all", "support", "analytics", "devops", "finance", "compliance", "workflow"]

function generateSlug(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word, i) => (i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join("")
}

const MAX_DESCRIPTION_LENGTH = 255

export function AgentCreateModal(props: AgentCreateModalProps) {
  const subscriptionQuery = useSubscription()

  const limitCheck = createMemo(() => {
    if (!subscriptionQuery.data) return null
    return checkAgentLimit(props.currentAgentCount, subscriptionQuery.data.plan as SubscriptionPlan)
  })

  const canCreate = createMemo(() => limitCheck()?.allowed ?? true)

  const [step, setStep] = createSignal<Step>("select-template")
  const [selectedCategory, setSelectedCategory] = createSignal<CategoryOption>("all")
  const [selectedTemplate, setSelectedTemplate] = createSignal<AgentTemplate | null>(null)
  const [name, setName] = createSignal("")
  const [slug, setSlug] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [error, setError] = createSignal<string | null>(null)
  const [slugManuallyEdited, setSlugManuallyEdited] = createSignal(false)

  const [selectedIcon, setSelectedIcon] = createSignal("CircleDashed")
  const [selectedColor, setSelectedColor] = createSignal<IconColor>("blue")
  const [showIconPicker, setShowIconPicker] = createSignal(false)
  let iconPickerRef: HTMLDivElement | undefined

  const [templates] = createResource(
    () => props.open,
    async (open) => {
      if (!open) return []
      const res = await api.api.agents.templates.$get()
      if (!res.ok) return []
      const data = await res.json()
      return data.templates as AgentTemplate[]
    },
  )

  const filteredTemplates = createMemo(() => {
    const all = templates() ?? []
    const category = selectedCategory()
    if (category === "all") return all
    return all.filter((t) => t.category === category)
  })

  const categoryCounts = createMemo(() => {
    const all = templates() ?? []
    const counts: Record<CategoryOption, number> = {
      all: all.length,
      support: 0,
      analytics: 0,
      devops: 0,
      finance: 0,
      compliance: 0,
      workflow: 0,
    }
    for (const t of all) {
      if (t.category in counts) {
        counts[t.category as TemplateCategory]++
      }
    }
    return counts
  })

  const handleClickOutside = (e: MouseEvent) => {
    if (showIconPicker() && iconPickerRef && !iconPickerRef.contains(e.target as Node)) {
      setShowIconPicker(false)
    }
  }

  if (typeof document !== "undefined") {
    document.addEventListener("click", handleClickOutside)
    onCleanup(() => {
      document.removeEventListener("click", handleClickOutside)
    })
  }

  createEffect(() => {
    if (props.open) {
      setStep("select-template")
      setSelectedCategory("all")
      setSelectedTemplate(null)
      setName("")
      setSlug("")
      setDescription("")
      setError(null)
      setSlugManuallyEdited(false)
      setSelectedIcon("CircleDashed")
      setSelectedColor("blue")
      setShowIconPicker(false)
    }
  })

  const selectedColorValue = () => ICON_COLORS.find((c) => c.id === selectedColor())?.value ?? ICON_COLORS[0].value

  const selectedBg = () => `color-mix(in srgb, ${selectedColorValue()} 15%, transparent)`

  const renderSelectedIcon = () => {
    const IconComponent = getIconComponent(selectedIcon())
    if (!IconComponent) return null
    const color = selectedColorValue()
    return <IconComponent size={14} weight="duotone" color={color} fill={color} style={{ color }} />
  }

  const handleSelectScratch = () => {
    setSelectedTemplate(null)
    setSelectedIcon("CircleDashed")
    setSelectedColor("blue")
    setName("")
    setSlug("")
    setDescription("")
    setStep("configure")
  }

  const handleSelectTemplate = (template: AgentTemplate) => {
    setSelectedTemplate(template)
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
    setStep("select-template")
    setSelectedTemplate(null)
    setName("")
    setSlug("")
    setDescription("")
    setSlugManuallyEdited(false)
  }

  const handleSave = async () => {
    const template = selectedTemplate()

    if (template) {
      await props.onSave({
        name: template.name,
        slug: `${generateSlug(template.name)}-${Date.now().toString(36)}`,
        description: template.description,
        icon: template.icon,
        iconColor: template.iconColor as IconColor,
        templateId: template.id,
        runtimeConfig: {
          model: { provider: "anthropic", model: "claude-sonnet-4-20250514", temperature: 0.7 },
          systemPrompt: template.prompt ?? "",
          tools: [],
        },
      })
      return
    }

    if (!name().trim()) {
      setError("Name is required")
      return
    }
    if (!slug().trim()) {
      setError("Slug is required")
      return
    }

    await props.onSave({
      name: name().trim(),
      slug: slug().trim(),
      description: description().trim(),
      icon: selectedIcon(),
      iconColor: selectedColor(),
      runtimeConfig: {
        model: { provider: "anthropic", model: "claude-sonnet-4-20250514", temperature: 0.7 },
        systemPrompt: "",
        tools: [],
      },
    })
  }

  const isScratch = () => step() === "configure" && !selectedTemplate()

  return (
    <>
      <Modal open={props.open} onBackdropClick={props.onClose} onEscape={props.onClose}>
        <ModalContainer size={step() === "select-template" ? "4xl" : selectedTemplate() ? "2xl" : "md"}>
          <div class="flex items-center justify-between border-b border-border px-3 py-2">
            <div class="flex items-center gap-2">
              <Show when={step() === "configure"}>
                <button
                  type="button"
                  class="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
                  onClick={handleBack}
                >
                  <CaretLeft class="h-4 w-4" weight="bold" />
                </button>
              </Show>
              <span class="text-xs font-medium text-text">Create agent</span>
              <Show when={limitCheck()}>
                <LimitBadge current={limitCheck()!.current} limit={limitCheck()!.limit} label="agents" />
              </Show>
            </div>
            <button
              type="button"
              class="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
              onClick={props.onClose}
            >
              <X class="h-4 w-4" weight="bold" />
            </button>
          </div>

          <Show when={step() === "select-template"}>
            <Show
              when={!templates.loading}
              fallback={
                <div class="flex justify-center py-12">
                  <Spinner />
                </div>
              }
            >
              <div class="flex h-[480px]">
                <div class="w-36 shrink-0 overflow-y-auto border-r border-border bg-surface-muted/50 p-2 scrollbar-thin">
                  <For each={CATEGORY_ORDER}>
                    {(category) => {
                      const config = CATEGORY_CONFIG[category]
                      const Icon = config.icon
                      const count = categoryCounts()[category]
                      return (
                        <button
                          type="button"
                          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors"
                          classList={{
                            "bg-accent/10 text-accent": selectedCategory() === category,
                            "text-text-muted hover:bg-surface-muted hover:text-text": selectedCategory() !== category,
                          }}
                          onClick={() => setSelectedCategory(category)}
                        >
                          <Icon class="h-4 w-4 shrink-0" weight="duotone" />
                          <span class="flex-1 truncate">{config.label}</span>
                          <span class="text-2xs opacity-60">{count}</span>
                        </button>
                      )
                    }}
                  </For>
                </div>

                <div class="flex flex-1 flex-col overflow-y-auto p-3 scrollbar-thin">
                  <button
                    type="button"
                    class="mb-3 flex items-center gap-3 rounded-lg border border-dashed border-accent/40 bg-accent/5 p-3 text-left transition-colors hover:border-accent hover:bg-accent/10"
                    onClick={handleSelectScratch}
                  >
                    <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/15">
                      <Sparkle class="h-4 w-4 text-accent" weight="duotone" />
                    </div>
                    <div class="flex flex-col">
                      <span class="text-xs font-medium text-text">Start from scratch</span>
                      <span class="text-2xs text-text-muted">Build a custom agent with Copilot guidance</span>
                    </div>
                  </button>

                  <Show
                    when={filteredTemplates().length > 0}
                    fallback={
                      <div class="flex flex-1 items-center justify-center text-sm text-text-muted">
                        No templates in this category
                      </div>
                    }
                  >
                    <div class="grid grid-cols-3 gap-2">
                      <For each={filteredTemplates()}>
                        {(template) => (
                          <button
                            type="button"
                            class="flex flex-col gap-2 rounded-lg border border-border bg-surface-elevated p-3 text-left transition-colors hover:border-border-strong"
                            onClick={() => handleSelectTemplate(template)}
                          >
                            <div class="flex items-center gap-3">
                              <EntityIcon icon={template.icon} iconColor={template.iconColor} size={32} rounded="md" />
                              <div class="min-w-0 flex-1">
                                <h3 class="truncate text-xs font-medium text-text">{template.name}</h3>
                                <p class="text-2xs capitalize text-text-muted">{template.category.replace("-", " ")}</p>
                              </div>
                            </div>
                            <p class="line-clamp-2 text-2xs text-text-muted">{template.description}</p>
                            <Show when={template.suggestedResources.length > 0}>
                              <div class="mt-auto flex items-center gap-1 border-t border-border pt-2">
                                <For each={template.suggestedResources}>
                                  {(r) => <ResourceIcon type={r} class="h-4 w-4 text-text-muted" />}
                                </For>
                              </div>
                            </Show>
                          </button>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </div>

              <ModalFooter>
                <Button variant="ghost" size="sm" onClick={props.onClose}>
                  Cancel
                </Button>
              </ModalFooter>
            </Show>
          </Show>

          <Show when={step() === "configure" && selectedTemplate()}>
            {(template) => {
              const scenario = () => template().demoScenarios[0] ?? null
              const iconColor = () =>
                ICON_COLORS.find((c) => c.id === template().iconColor)?.value ?? ICON_COLORS[0].value
              const IconComponent = () => {
                const Icon = getIconComponent(template().icon)
                return Icon ? <Icon class="h-4 w-4" weight="duotone" /> : null
              }
              return (
                <>
                  <ModalBody class="p-4">
                    <Show when={!canCreate() && limitCheck()}>
                      <UpgradePrompt feature="Agent limit reached" message={limitCheck()!.message} />
                    </Show>

                    <div class="mb-4 flex items-center gap-3">
                      <div
                        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                        style={{ "background-color": `${iconColor()}26`, color: iconColor() }}
                      >
                        <IconComponent />
                      </div>
                      <div>
                        <h3 class="text-sm font-medium text-text">{template().name}</h3>
                        <p class="text-xs text-text-muted">{template().description}</p>
                      </div>
                    </div>

                    <Show when={scenario()}>
                      {(s) => <DemoPreview scenario={s()} class="min-h-[300px]" speed="normal" />}
                    </Show>

                    <Show when={template().suggestedResources.length > 0}>
                      <div class="mt-4">
                        <p class="mb-2 text-xs text-text-muted">Typically connects to</p>
                        <div class="flex flex-wrap gap-2">
                          <For each={template().suggestedResources}>
                            {(r) => (
                              <div class="flex items-center gap-1.5 rounded-md border border-border bg-surface-muted px-2 py-1">
                                <ResourceIcon type={r} class="h-4 w-4" />
                                <span class="text-xs text-text">{r}</span>
                              </div>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>
                  </ModalBody>
                  <ModalFooter>
                    <Button variant="ghost" size="sm" onClick={props.onClose}>
                      Cancel
                    </Button>
                    <Button variant="default" size="sm" onClick={handleSave} disabled={props.saving || !canCreate()}>
                      {props.saving && <Spinner size="xs" class="border-white border-t-transparent" />}
                      {props.saving ? "Creating..." : "Use this template"}
                    </Button>
                  </ModalFooter>
                </>
              )
            }}
          </Show>

          <Show when={step() === "configure" && isScratch()}>
            <ModalBody>
              <Show when={!canCreate() && limitCheck()}>
                <UpgradePrompt feature="Agent limit reached" message={limitCheck()!.message} />
              </Show>

              <div class="flex items-center gap-2.5">
                <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/10">
                  <Sparkle class="h-3.5 w-3.5 text-accent" weight="duotone" />
                </div>
                <div class="flex flex-col">
                  <span class="text-xs font-medium text-text">Start from Scratch</span>
                  <span class="text-2xs text-text-muted">Build with Copilot guidance</span>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <label class="w-16 shrink-0 text-xs text-text-muted">Name</label>
                <div class="flex flex-1 items-center gap-1.5">
                  <div ref={iconPickerRef} class="relative">
                    <button
                      type="button"
                      class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent transition-colors hover:border-border-strong"
                      classList={{ "border-accent": showIconPicker() }}
                      style={{
                        "background-color": selectedBg(),
                        color: selectedColorValue(),
                        fill: selectedColorValue(),
                      }}
                      title="Choose icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowIconPicker(!showIconPicker())
                      }}
                    >
                      {renderSelectedIcon()}
                    </button>

                    <Show when={showIconPicker()}>
                      <div class="absolute left-0 top-full z-50 mt-1 rounded-lg border border-border bg-surface p-3 shadow-elevated">
                        <IconPicker
                          selectedIcon={selectedIcon()}
                          selectedColor={selectedColor()}
                          onIconChange={setSelectedIcon}
                          onColorChange={setSelectedColor}
                        />
                      </div>
                    </Show>
                  </div>
                  <Input
                    type="text"
                    value={name()}
                    onInput={(e) => handleNameChange(e.currentTarget.value)}
                    placeholder="Refund Processor"
                    class="h-7 flex-1 text-xs"
                  />
                </div>
              </div>

              <div class="flex items-center gap-2">
                <label class="w-16 shrink-0 text-xs text-text-muted">Slug</label>
                <Input
                  type="text"
                  value={slug()}
                  onInput={(e) => handleSlugChange(e.currentTarget.value)}
                  placeholder="refundProcessor"
                  class="h-7 flex-1 font-code text-xs"
                />
              </div>

              <div class="flex items-start gap-2">
                <label class="w-16 shrink-0 pt-1.5 text-xs text-text-muted">Description</label>
                <div class="flex flex-1 flex-col gap-0.5">
                  <Textarea
                    value={description()}
                    onInput={(e) => handleDescriptionChange(e.currentTarget.value)}
                    placeholder="Handles customer refund requests automatically"
                    rows={2}
                  />
                  <span class="self-end text-[10px] text-text-muted">
                    {description().length}/{MAX_DESCRIPTION_LENGTH}
                  </span>
                </div>
              </div>

              <Show when={error()}>
                <div class="rounded-md border border-danger bg-danger-soft px-2.5 py-1.5 text-2xs text-danger">
                  {error()}
                </div>
              </Show>
            </ModalBody>

            <ModalFooter>
              <Button variant="ghost" size="sm" onClick={props.onClose}>
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleSave}
                disabled={props.saving || !name().trim() || !slug().trim() || !canCreate()}
              >
                {props.saving && <Spinner size="xs" class="border-white border-t-transparent" />}
                {props.saving ? "Creating..." : "Create"}
              </Button>
            </ModalFooter>
          </Show>
        </ModalContainer>
      </Modal>
    </>
  )
}
