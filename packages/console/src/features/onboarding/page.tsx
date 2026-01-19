import { For, Show, createResource, createSignal, createMemo, createEffect, onMount, onCleanup } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { Sparkle, ArrowRight } from "phosphor-solid-js"
import type { AgentTemplate, TemplateCategory, LlmProvider } from "@synatra/core/types"
import { generateSlug } from "@synatra/util/identifier"
import { api, user, OrgGuard } from "../../app"
import { Spinner, Button, FormError } from "../../ui"
import { ResourceIcon, EntityIcon } from "../../components"
import { DemoPreview } from "./demo-preview"
import { LlmSetupModal } from "./llm-setup-modal"
import type { Environments, Resources } from "../../app/api"

const CATEGORY_LABELS: Record<TemplateCategory | "all", string> = {
  all: "All",
  support: "Support",
  analytics: "Analytics",
  devops: "DevOps",
  finance: "Finance",
  compliance: "Compliance",
  workflow: "Workflow",
}

const RESOURCE_LABELS: Record<string, string> = {
  postgres: "PostgreSQL",
  mysql: "MySQL",
  firebase: "Firebase",
  graphql: "GraphQL",
  javascript: "JavaScript",
  mongodb: "MongoDB",
  restapi: "REST API",
  stripe: "Stripe",
  github: "GitHub",
  intercom: "Intercom",
}

const ICON_COLOR_VALUES: Record<string, string> = {
  gray: "#6B7280",
  yellow: "#F59E0B",
  red: "#EF4444",
  blue: "#3B82F6",
  green: "#22C55E",
  plum: "#A855F7",
  indigo: "#6366F1",
}

const GREETING_MESSAGES = ["Hey, I'm here to work for you.", "What's eating your time?"]

type GreetingScreenProps = {
  onComplete: (sourceRect: DOMRect | null) => void
}

function GreetingScreen(props: GreetingScreenProps) {
  const [lines, setLines] = createSignal<string[]>([])
  const [text, setText] = createSignal("")
  const [cursor, setCursor] = createSignal(true)
  const ref = { ids: [] as number[], mounted: true }
  let iconRef: HTMLDivElement | undefined

  const clear = () => {
    ref.ids.forEach((id) => window.clearTimeout(id))
    ref.ids = []
  }

  const wait = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => ref.mounted && fn(), ms)
    ref.ids.push(id)
  }

  const complete = () => {
    if (!ref.mounted) return
    setCursor(false)
    const rect = iconRef?.getBoundingClientRect() ?? null
    props.onComplete(rect)
  }

  const typeChar = (line: string, i: number, idx: number) => {
    if (i <= line.length) {
      setText(line.slice(0, i))
      wait(() => typeChar(line, i + 1, idx), 8 + Math.random() * 6)
    } else {
      setLines((prev) => [...prev, line])
      setText("")
      if (idx < GREETING_MESSAGES.length - 1) {
        wait(() => startLine(idx + 1), 300)
      } else {
        wait(() => {
          setCursor(false)
          wait(complete, 600)
        }, 300)
      }
    }
  }

  const startLine = (idx: number) => typeChar(GREETING_MESSAGES[idx], 0, idx)

  onMount(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLines(GREETING_MESSAGES)
      setCursor(false)
      wait(complete, 800)
    } else {
      wait(() => startLine(0), 400)
    }
  })

  onCleanup(() => {
    ref.mounted = false
    clear()
  })

  return (
    <div class="flex h-screen items-center justify-center bg-surface px-6">
      <div class="flex max-w-lg items-start gap-4">
        <div ref={iconRef} class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft">
          <Sparkle class="h-5 w-5 text-accent" weight="duotone" />
        </div>
        <div class="flex-1 space-y-3 pt-1">
          <For each={lines()}>{(line) => <p class="text-base leading-relaxed text-text">{line}</p>}</For>
          <Show when={text() || lines().length < GREETING_MESSAGES.length}>
            <p class="text-base leading-relaxed text-text">
              {text()}
              <span
                class="ml-0.5 inline-block h-[1.2em] w-0.5 bg-accent align-text-bottom transition-opacity duration-200"
                classList={{ "animate-pulse": cursor(), "opacity-0": !cursor() }}
              />
            </p>
          </Show>
        </div>
      </div>
    </div>
  )
}

function TransitionScreen(props: { onComplete: () => void }) {
  let iconRef: HTMLDivElement | undefined
  let textRef: HTMLDivElement | undefined
  const ref = { mounted: true, timeouts: [] as number[] }

  const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

  onMount(() => {
    if (reducedMotion) {
      const id = window.setTimeout(() => ref.mounted && props.onComplete(), 800)
      ref.timeouts.push(id)
      return
    }

    ref.timeouts.push(
      window.setTimeout(() => {
        if (!ref.mounted || !iconRef || !textRef) return

        textRef.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 300,
          easing: "ease-out",
          fill: "forwards",
        })

        const anim = iconRef.animate(
          [
            { transform: "translateX(0) scale(1)", opacity: 1 },
            { transform: "translateX(calc(50vw - 60px)) scale(0.8)", opacity: 0 },
          ],
          { duration: 500, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" },
        )

        anim.onfinish = () => ref.mounted && props.onComplete()
      }, 1000),
    )
  })

  onCleanup(() => {
    ref.mounted = false
    ref.timeouts.forEach((id) => window.clearTimeout(id))
  })

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-surface">
      <div class="flex max-w-lg items-start gap-4">
        <div
          ref={iconRef}
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft"
          style={{ "will-change": "transform, opacity" }}
        >
          <Sparkle class="h-5 w-5 text-accent" weight="duotone" />
        </div>
        <div ref={textRef} class="pt-2" style={{ "will-change": "opacity" }}>
          <p class="animate-fade-in text-base leading-relaxed text-text">Let's build it.</p>
        </div>
      </div>
    </div>
  )
}

function OnboardingContent() {
  const navigate = useNavigate()
  const [showGreeting, setShowGreeting] = createSignal(true)
  const [selected, setSelected] = createSignal<AgentTemplate | null>(null)
  const [scratchMode, setScratchMode] = createSignal(false)
  const [creating, setCreating] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [category, setCategory] = createSignal<TemplateCategory | "all">("all")
  const [cardsReady, setCardsReady] = createSignal(false)
  const [previewVisible, setPreviewVisible] = createSignal(false)
  const [iconAnimating, setIconAnimating] = createSignal(false)
  const [showTransition, setShowTransition] = createSignal(false)
  const [pendingAgentId, setPendingAgentId] = createSignal<string | null>(null)
  const [showLlmModal, setShowLlmModal] = createSignal(false)
  const [savingLlm, setSavingLlm] = createSignal(false)
  const [pendingTemplate, setPendingTemplate] = createSignal<AgentTemplate | null>(null)
  let headerIconRef: HTMLDivElement | undefined
  const cleanup = { animation: null as Animation | null, timeouts: [] as number[], mounted: true }

  const [templates] = createResource(async () => {
    const res = await api.api.agents.templates.$get()
    if (!res.ok) throw new Error("Failed to fetch templates")
    const data = await res.json()
    return data.templates as AgentTemplate[]
  })

  const [environments] = createResource(async () => {
    const res = await api.api.environments.$get()
    if (!res.ok) return []
    return (await res.json()) as Environments
  })

  const [resources, { refetch: refetchResources }] = createResource(async () => {
    const res = await api.api.resources.$get()
    if (!res.ok) return []
    return (await res.json()) as Resources
  })

  const productionEnv = createMemo(() => environments()?.find((e) => e.slug === "production"))

  const synatraAiResource = createMemo(() => resources()?.find((r) => r.type === "synatra_ai"))

  createEffect(() => {
    const all = templates()
    if (all && all.length > 0 && !selected()) {
      setSelected(all[0])
    }
  })

  createEffect(() => {
    if ((selected() || scratchMode()) && !previewVisible() && cleanup.mounted) {
      const id = window.setTimeout(() => setPreviewVisible(true), 100)
      cleanup.timeouts.push(id)
    }
  })

  onCleanup(() => {
    cleanup.mounted = false
    cleanup.animation?.cancel()
    cleanup.timeouts.forEach((id) => window.clearTimeout(id))
  })

  const categories = createMemo(() => {
    const all = templates() ?? []
    const cats = new Set(all.map((t) => t.category))
    return ["all" as const, ...Array.from(cats)] as (TemplateCategory | "all")[]
  })

  const filtered = createMemo(() => {
    const all = templates() ?? []
    if (category() === "all") return all
    return all.filter((t) => t.category === category())
  })

  const firstName = createMemo(() => {
    const name = user()?.name
    if (!name) return null
    return name.split(" ")[0]
  })

  const scenario = () => selected()?.demoScenarios[0] ?? null

  const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

  const handleGreetingComplete = (sourceRect: DOMRect | null) => {
    setShowGreeting(false)

    if (reducedMotion || !sourceRect) {
      setCardsReady(true)
      return
    }

    setIconAnimating(true)

    requestAnimationFrame(() => {
      if (!cleanup.mounted) return
      const targetRect = headerIconRef?.getBoundingClientRect()
      if (!targetRect || !headerIconRef) {
        setCardsReady(true)
        setIconAnimating(false)
        return
      }

      const deltaX = sourceRect.left - targetRect.left
      const deltaY = sourceRect.top - targetRect.top

      cleanup.animation = headerIconRef.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)`, opacity: 1 },
          { transform: "translate(0, 0)", opacity: 1 },
        ],
        { duration: 600, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "forwards" },
      )
      cleanup.animation.onfinish = () => {
        if (!cleanup.mounted) return
        setIconAnimating(false)
        animateCards()
      }
    })
  }

  const animateCards = () => {
    if (reducedMotion || !cleanup.mounted) {
      setCardsReady(true)
      return
    }

    const cards = document.querySelectorAll(".template-card")
    cards.forEach((card, i) => {
      const id = window.setTimeout(() => {
        if (cleanup.mounted) card.classList.add("is-visible")
      }, i * 80)
      cleanup.timeouts.push(id)
    })
    setCardsReady(true)
  }

  const handleStartCreate = (template: AgentTemplate | null) => {
    setPendingTemplate(template)
    setShowLlmModal(true)
  }

  const handleLlmSave = async (provider: LlmProvider, apiKey: string) => {
    setSavingLlm(true)
    setError(null)

    const prodEnv = productionEnv()
    if (!prodEnv) throw new Error("Production environment not found")

    let resourceId = synatraAiResource()?.id

    if (!resourceId) {
      const createRes = await api.api.resources.$post({
        json: { name: "Synatra AI", slug: "synatra_ai", type: "synatra_ai", configs: [] },
      })
      if (!createRes.ok) {
        setSavingLlm(false)
        throw new Error("Failed to create LLM resource")
      }
      const created = await createRes.json()
      resourceId = created.id
      await refetchResources()
    }

    const configRes = await api.api.resources[":id"].config.$post({
      param: { id: resourceId },
      json: { environmentId: prodEnv.id, config: { [provider]: { apiKey, enabled: true } } },
    })
    if (!configRes.ok) {
      setSavingLlm(false)
      throw new Error("Failed to save LLM configuration")
    }

    setSavingLlm(false)
    setShowLlmModal(false)
    await handleCreate(pendingTemplate())
  }

  const handleCreate = async (template: AgentTemplate | null) => {
    setCreating(true)
    setError(null)
    try {
      const name = template?.name ?? "New Agent"
      const slug = generateSlug(name) + "-" + Date.now().toString(36)

      const res = await api.api.agents.$post({
        json: {
          name,
          slug,
          description: template?.description ?? "",
          icon: template?.icon ?? "CircleDashed",
          iconColor: template?.iconColor ?? "blue",
          templateId: template?.id,
          runtimeConfig: {
            model: { provider: "anthropic", model: "claude-sonnet-4-20250514", temperature: 0.7 },
            systemPrompt: "",
            tools: [],
          },
        },
      })

      if (!res.ok) throw new Error("Failed to create agent")
      const data = await res.json()
      setPendingAgentId(data.id)
      setShowTransition(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create agent")
      setCreating(false)
    }
  }

  const handleTransitionComplete = () => {
    const agentId = pendingAgentId()
    if (agentId && cleanup.mounted) {
      navigate(`/agents/${agentId}?startCopilot=true&showCopilotHighlight=true`)
    }
  }

  return (
    <Show when={!showGreeting()} fallback={<GreetingScreen onComplete={handleGreetingComplete} />}>
      <Show when={showTransition()}>
        <TransitionScreen onComplete={handleTransitionComplete} />
      </Show>
      <div class="flex h-screen flex-col bg-surface" classList={{ "pointer-events-none": showTransition() }}>
        <header class="border-b border-border px-4 py-3">
          <div class="flex items-center gap-3">
            <div
              ref={headerIconRef}
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft"
              style={{ opacity: iconAnimating() ? 0 : 1 }}
            >
              <Sparkle class="h-5 w-5 text-accent" weight="duotone" />
            </div>
            <div>
              <h1 class="text-[15px] font-semibold text-text">
                {firstName() ? `Hey ${firstName()}, what can I help with?` : "What can I help with?"}
              </h1>
              <p class="mt-0.5 text-xs text-text-muted">Pick a template or describe what you need</p>
            </div>
          </div>
        </header>

        <div class="flex flex-1 overflow-hidden">
          <div class="flex w-[420px] shrink-0 flex-col border-r border-border bg-surface p-4">
            <Show
              when={!templates.loading}
              fallback={
                <div class="flex flex-1 items-center justify-center">
                  <Spinner />
                </div>
              }
            >
              <div class="mb-3 flex flex-wrap gap-1">
                <For each={categories()}>
                  {(cat) => (
                    <button
                      type="button"
                      class={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        category() === cat
                          ? "bg-accent text-white"
                          : "text-text-muted hover:bg-surface-muted hover:text-text"
                      }`}
                      onClick={() => setCategory(cat)}
                    >
                      {CATEGORY_LABELS[cat]}
                    </button>
                  )}
                </For>
              </div>

              <div class="flex-1 overflow-y-auto scrollbar-thin">
                <div class="grid grid-cols-2 gap-3">
                  <For each={filtered()}>
                    {(template) => (
                      <button
                        type="button"
                        style={{
                          "--glow-color": ICON_COLOR_VALUES[template.iconColor ?? "blue"] ?? ICON_COLOR_VALUES.blue,
                        }}
                        class={`template-card flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-colors ${
                          !scratchMode() && selected()?.id === template.id
                            ? "is-selected"
                            : "border-border hover:border-border-strong"
                        } ${reducedMotion || cardsReady() ? "is-visible" : ""}`}
                        onClick={() => {
                          setScratchMode(false)
                          setSelected(template)
                        }}
                      >
                        <div class="template-icon">
                          <EntityIcon icon={template.icon} iconColor={template.iconColor} size={40} rounded="lg" />
                        </div>
                        <div class="min-w-0">
                          <h3 class="text-xs font-medium text-text">{template.name}</h3>
                          <p class="mt-0.5 line-clamp-2 text-2xs text-text-muted">{template.description}</p>
                        </div>
                      </button>
                    )}
                  </For>
                </div>

                <div class="mt-4 pt-4 border-t border-border">
                  <button
                    type="button"
                    class={`template-card group flex w-full items-center gap-3 rounded-lg border border-dashed p-3 text-left transition-colors ${
                      scratchMode() ? "border-accent bg-accent-soft" : "hover:border-accent hover:bg-accent-soft"
                    } ${reducedMotion || cardsReady() ? "is-visible" : ""}`}
                    onClick={() => {
                      setSelected(null)
                      setScratchMode(true)
                    }}
                  >
                    <div class="template-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-text-muted transition-colors group-hover:bg-accent/20 group-hover:text-accent">
                      <Sparkle class="h-5 w-5" weight="duotone" />
                    </div>
                    <div class="min-w-0 flex-1">
                      <h3 class="text-xs font-medium text-text">Start from scratch</h3>
                      <p class="text-2xs text-text-muted">Describe what you need, I'll build it</p>
                    </div>
                  </button>
                </div>
              </div>
            </Show>
          </div>

          <div
            class={`preview-panel flex flex-1 flex-col overflow-hidden bg-surface-elevated ${previewVisible() ? "is-visible" : ""}`}
          >
            <Show
              when={selected() || scratchMode()}
              fallback={
                <div class="flex flex-1 items-center justify-center text-xs text-text-muted">
                  Select a template to preview
                </div>
              }
            >
              <Show
                when={!scratchMode() && selected()}
                fallback={
                  <div class="flex flex-1 flex-col overflow-hidden">
                    <div class="flex items-start gap-3 border-b border-border p-4">
                      <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-accent-soft">
                        <Sparkle class="h-6 w-6 text-accent" weight="duotone" />
                      </div>
                      <div class="min-w-0 flex-1">
                        <h2 class="text-sm font-semibold text-text">Just tell me what you need</h2>
                        <p class="mt-0.5 text-xs text-text-muted">I'll figure out the rest</p>
                      </div>
                    </div>

                    <div class="flex flex-1 flex-col items-center justify-center p-6 text-center">
                      <div class="max-w-xs space-y-3">
                        <p class="text-sm text-text">
                          "Hey, I need to track failed payments and retry them automatically."
                        </p>
                        <p class="text-xs text-text-muted">
                          Just describe the problem. I'll build the agent, connect the resources, and set up the
                          workflow.
                        </p>
                      </div>
                    </div>

                    <FormError message={error()} class="mx-4 mb-4" />

                    <div class="flex items-center justify-between border-t border-border px-4 py-3">
                      <p class="text-2xs text-text-muted">You can customize everything after creation</p>
                      <Button variant="default" size="sm" onClick={() => handleStartCreate(null)} disabled={creating()}>
                        {creating() ? (
                          <>
                            <Spinner size="xs" class="border-white border-t-transparent" />
                            Creating...
                          </>
                        ) : (
                          <>
                            Get started
                            <ArrowRight class="h-3 w-3" />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                }
              >
                {(template) => (
                  <div class="flex flex-1 flex-col overflow-hidden">
                    <div class="flex items-start gap-3 border-b border-border p-4">
                      <EntityIcon icon={template().icon} iconColor={template().iconColor} size={48} rounded="lg" />
                      <div class="min-w-0 flex-1">
                        <h2 class="text-sm font-semibold text-text">{template().name}</h2>
                        <p class="mt-0.5 text-xs text-text-muted">{template().description}</p>
                        <Show when={template().suggestedResources.length > 0}>
                          <div class="mt-2 flex flex-wrap gap-1">
                            <For each={template().suggestedResources}>
                              {(r) => (
                                <div class="flex items-center gap-1 rounded bg-surface-muted px-1.5 py-0.5">
                                  <ResourceIcon type={r} class="h-3 w-3" />
                                  <span class="text-2xs text-text-muted">{RESOURCE_LABELS[r] ?? r}</span>
                                </div>
                              )}
                            </For>
                          </div>
                        </Show>
                      </div>
                    </div>

                    <div class="flex-1 overflow-hidden p-4">
                      <Show when={scenario()}>
                        {(s) => (
                          <DemoPreview
                            scenario={s()}
                            agent={{ icon: template().icon, iconColor: template().iconColor, name: template().name }}
                            class="h-full"
                            speed="normal"
                          />
                        )}
                      </Show>
                    </div>

                    <FormError message={error()} class="mx-4 mb-4" />

                    <div class="flex items-center justify-between border-t border-border px-4 py-3">
                      <p class="text-2xs text-text-muted">You can customize everything after creation</p>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleStartCreate(template())}
                        disabled={creating()}
                      >
                        {creating() ? (
                          <>
                            <Spinner size="xs" class="border-white border-t-transparent" />
                            Creating...
                          </>
                        ) : (
                          <>
                            Use this template
                            <ArrowRight class="h-3 w-3" />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </Show>
            </Show>
          </div>
        </div>

        <LlmSetupModal
          open={showLlmModal()}
          onClose={() => setShowLlmModal(false)}
          onSave={handleLlmSave}
          saving={savingLlm()}
        />
      </div>
    </Show>
  )
}

export default function OnboardingPage() {
  return (
    <OrgGuard>
      <OnboardingContent />
    </OrgGuard>
  )
}
