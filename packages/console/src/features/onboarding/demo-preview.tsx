import { For, Match, Show, Switch, createEffect, createSignal, onCleanup } from "solid-js"
import { Dynamic } from "solid-js/web"
import { CheckCircle, CircleNotch, Wrench, Warning, Info, WarningOctagon } from "phosphor-solid-js"
import { Badge, Button, Spinner } from "../../ui"
import { getIconComponent, ICON_COLORS, OutputItemRenderer } from "../../components"
import type { DemoScenario, DemoStep, DemoWidget, DemoQuestion, DemoSelectRows, DemoConfirm } from "@synatra/core/types"
import type { OutputItem } from "../../app/api"

type DemoItem = {
  id: string
  type: DemoStep["type"]
  text?: string
  name?: string
  status?: "running" | "success"
  approvalState?: "pending" | "approving" | "approved"
  widget?: DemoWidget
  question?: DemoQuestion
  questionState?: "pending" | "selecting" | "answered"
  selectRows?: DemoSelectRows
  selectRowsState?: "pending" | "selecting" | "selected"
  confirm?: DemoConfirm
  confirmState?: "pending" | "confirming" | "confirmed"
}

type Speed = "slow" | "normal" | "fast" | "instant"

type DemoPreviewProps = {
  scenario: DemoScenario
  agent?: { icon: string; iconColor: string; name: string } | null
  class?: string
  loop?: boolean
  speed?: Speed
}

const SPEED_MULTIPLIER: Record<Speed, number> = { slow: 1.5, normal: 1, fast: 0.5, instant: 0 }
const CHAR_DELAY: Record<Speed, { user: number; agent: number }> = {
  slow: { user: 20, agent: 15 },
  normal: { user: 10, agent: 15 },
  fast: { user: 6, agent: 8 },
  instant: { user: 0, agent: 0 },
}

function AgentAvatar(props: { icon?: string; iconColor?: string; size?: number }) {
  const size = () => props.size ?? 24
  const colorValue = () => ICON_COLORS.find((c) => c.id === props.iconColor)?.value ?? ICON_COLORS[0].value
  const IconComponent = () => (props.icon ? getIconComponent(props.icon) : null)

  return (
    <span
      class="flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: `${size()}px`,
        height: `${size()}px`,
        "background-color": `color-mix(in srgb, ${colorValue()} 15%, transparent)`,
      }}
    >
      {IconComponent() ? (
        <Dynamic component={IconComponent()!} size={size() * 0.55} weight="duotone" style={{ color: colorValue() }} />
      ) : (
        <span class="text-2xs font-medium" style={{ color: colorValue() }}>
          AI
        </span>
      )}
    </span>
  )
}

export function DemoPreview(props: DemoPreviewProps) {
  const [items, setItems] = createSignal<DemoItem[]>([])
  const [isThinking, setIsThinking] = createSignal(false)
  let step = 0
  let count = 0
  let times: number[] = []
  let ticks: number[] = []
  let scrollRef: HTMLDivElement | undefined

  const speed = () => props.speed ?? "normal"
  const multiplier = () => SPEED_MULTIPLIER[speed()]
  const charDelay = () => CHAR_DELAY[speed()]
  const agentName = () => props.agent?.name ?? "Agent"

  const scrollToBottom = () => {
    if (scrollRef) scrollRef.scrollTop = scrollRef.scrollHeight
  }

  const clear = () => {
    times.forEach((id) => window.clearTimeout(id))
    ticks.forEach((id) => window.clearInterval(id))
    times = []
    ticks = []
  }

  const wait = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms)
    times.push(id)
  }

  const push = (item: DemoItem) => {
    setItems((prev) => [...prev, item])
    requestAnimationFrame(scrollToBottom)
  }

  const change = (id: string, text: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, text } : item)))
    requestAnimationFrame(scrollToBottom)
  }

  const isInstant = () => speed() === "instant"

  const runText = (id: string, text: string, charSpeed: number, done: () => void) => {
    if (isInstant() || charSpeed === 0) {
      change(id, text)
      wait(done, 50)
      return
    }
    let pos = 0
    const timer = window.setInterval(() => {
      pos += 1
      change(id, text.slice(0, pos))
      if (pos < text.length) return
      window.clearInterval(timer)
      wait(done, 250)
    }, charSpeed)
    ticks.push(timer)
  }

  const updateTool = (name: string, status: "running" | "success") => {
    setItems((prev) => {
      const list = [...prev]
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const item = list[i]
        if (item.type !== "tool_call") continue
        if (item.name !== name) continue
        list[i] = { ...item, status }
        return list
      }
      return [...list, { id: `tool-${count++}`, type: "tool_call", name, status }]
    })
  }

  const next = () => {
    const seq = props.scenario?.sequence
    if (!seq || seq.length === 0) return
    if (step >= seq.length) {
      if (props.loop === false) return
      wait(start, 4000 * multiplier())
      return
    }

    const item = seq[step]
    step += 1

    if (item.type === "user") {
      const id = `user-${count++}`
      push({ id, type: "user", text: "" })
      runText(id, item.text, charDelay().user, next)
      return
    }

    if (item.type === "agent") {
      const id = `agent-${count++}`
      push({ id, type: "agent", text: "" })
      runText(id, item.text, charDelay().agent, next)
      return
    }

    if (item.type === "thinking") {
      setIsThinking(true)
      wait(() => {
        setIsThinking(false)
        next()
      }, item.duration * multiplier())
      return
    }

    if (item.type === "tool_call") {
      updateTool(item.name, item.status)
      wait(next, 350 * multiplier())
      return
    }

    if (item.type === "approval") {
      const id = `approval-${count++}`
      push({ id, type: "approval", text: item.action, approvalState: "pending" })
      wait(
        () => {
          setItems((prev) => prev.map((entry) => (entry.id === id ? { ...entry, approvalState: "approving" } : entry)))
          wait(
            () => {
              setItems((prev) =>
                prev.map((entry) => (entry.id === id ? { ...entry, approvalState: "approved" } : entry)),
              )
              wait(next, isInstant() ? 50 : 400 * multiplier())
            },
            isInstant() ? 50 : 800 * multiplier(),
          )
        },
        isInstant() ? 50 : 1000 * multiplier(),
      )
      return
    }

    if (item.type === "delay") {
      wait(next, item.ms * multiplier())
      return
    }

    if (item.type === "widget") {
      const id = `widget-${count++}`
      push({ id, type: "widget", widget: item.widget })
      wait(next, isInstant() ? 50 : 300 * multiplier())
      return
    }

    if (item.type === "question") {
      const id = `question-${count++}`
      push({ id, type: "question", question: item.question, questionState: "pending" })
      wait(
        () => {
          setItems((prev) => prev.map((entry) => (entry.id === id ? { ...entry, questionState: "selecting" } : entry)))
          wait(
            () => {
              setItems((prev) =>
                prev.map((entry) => (entry.id === id ? { ...entry, questionState: "answered" } : entry)),
              )
              wait(next, isInstant() ? 50 : 400 * multiplier())
            },
            isInstant() ? 50 : 600 * multiplier(),
          )
        },
        isInstant() ? 50 : 800 * multiplier(),
      )
      return
    }

    if (item.type === "select_rows") {
      const id = `select-rows-${count++}`
      push({ id, type: "select_rows", selectRows: item.selectRows, selectRowsState: "pending" })
      wait(
        () => {
          setItems((prev) =>
            prev.map((entry) => (entry.id === id ? { ...entry, selectRowsState: "selecting" } : entry)),
          )
          wait(
            () => {
              setItems((prev) =>
                prev.map((entry) => (entry.id === id ? { ...entry, selectRowsState: "selected" } : entry)),
              )
              wait(next, isInstant() ? 50 : 400 * multiplier())
            },
            isInstant() ? 50 : 600 * multiplier(),
          )
        },
        isInstant() ? 50 : 800 * multiplier(),
      )
      return
    }

    if (item.type === "confirm") {
      const id = `confirm-${count++}`
      push({ id, type: "confirm", confirm: item.confirm, confirmState: "pending" })
      wait(
        () => {
          setItems((prev) => prev.map((entry) => (entry.id === id ? { ...entry, confirmState: "confirming" } : entry)))
          wait(
            () => {
              setItems((prev) =>
                prev.map((entry) => (entry.id === id ? { ...entry, confirmState: "confirmed" } : entry)),
              )
              wait(next, isInstant() ? 50 : 400 * multiplier())
            },
            isInstant() ? 50 : 600 * multiplier(),
          )
        },
        isInstant() ? 50 : 800 * multiplier(),
      )
      return
    }
  }

  const start = () => {
    clear()
    setItems([])
    setIsThinking(false)
    step = 0
    count = 0
    wait(next, 200)
  }

  createEffect(() => {
    props.scenario
    start()
  })

  onCleanup(clear)

  const colorValue = () => ICON_COLORS.find((c) => c.id === props.agent?.iconColor)?.value ?? ICON_COLORS[0].value

  return (
    <div class={`flex flex-col overflow-hidden rounded-lg border border-border bg-surface ${props.class ?? ""}`}>
      <div class="flex items-center gap-2 border-b border-border px-3 py-2">
        <AgentAvatar icon={props.agent?.icon} iconColor={props.agent?.iconColor} size={20} />
        <span class="text-xs font-medium text-text">{agentName()}</span>
        <Badge variant="default" class="text-2xs">
          Preview
        </Badge>
      </div>

      <div ref={scrollRef} class="flex-1 overflow-y-auto p-3 scrollbar-thin">
        <div class="flex flex-col gap-3">
          <For each={items()}>
            {(item) => (
              <Switch>
                <Match when={item.type === "user"}>
                  <div class="flex gap-2">
                    <div class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-2xs font-medium text-accent">
                      You
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-2xs text-text-muted mb-0.5">You</div>
                      <p class="text-xs leading-relaxed text-text whitespace-pre-wrap">{item.text}</p>
                    </div>
                  </div>
                </Match>
                <Match when={item.type === "agent"}>
                  <div class="flex gap-2">
                    <AgentAvatar icon={props.agent?.icon} iconColor={props.agent?.iconColor} size={20} />
                    <div class="flex-1 min-w-0">
                      <div class="text-2xs text-text-muted mb-0.5">{agentName()}</div>
                      <p class="text-xs leading-relaxed text-text whitespace-pre-wrap">{item.text}</p>
                    </div>
                  </div>
                </Match>
                <Match when={item.type === "tool_call"}>
                  <div class="pl-7">
                    <div class="flex items-center gap-1.5 rounded bg-surface-muted/50 px-2 py-1 text-2xs text-text-muted">
                      <Wrench class="h-3 w-3" />
                      <span class="font-code truncate">{item.name}</span>
                      <div class="ml-auto flex items-center gap-1">
                        <Show when={item.status === "running"}>
                          <CircleNotch class="h-3 w-3 animate-spin" />
                        </Show>
                        <Show when={item.status === "success"}>
                          <CheckCircle class="h-3 w-3 text-success" weight="fill" />
                        </Show>
                      </div>
                    </div>
                  </div>
                </Match>
                <Match when={item.type === "approval"}>
                  <div class="flex gap-2">
                    <AgentAvatar icon={props.agent?.icon} iconColor={props.agent?.iconColor} size={20} />
                    <div class="flex-1 min-w-0">
                      <Switch>
                        <Match when={item.approvalState === "approved"}>
                          <div class="rounded border border-success/50 bg-success/5 p-2">
                            <div class="flex items-center gap-1.5">
                              <Badge variant="success" class="text-2xs">
                                Approved
                              </Badge>
                              <span class="text-2xs text-text-muted truncate">{item.text}</span>
                            </div>
                          </div>
                        </Match>
                        <Match when={item.approvalState === "approving"}>
                          <div class="rounded border border-warning/50 bg-warning/5 p-2">
                            <div class="flex items-center gap-1.5 mb-1.5">
                              <Badge variant="warning" class="text-2xs">
                                Approval
                              </Badge>
                            </div>
                            <div class="mb-1.5 text-2xs text-text">{item.text}</div>
                            <div class="flex items-center gap-1">
                              <Button variant="default" size="xs" class="bg-success pointer-events-none">
                                <Spinner size="xs" class="border-white border-t-transparent" />
                              </Button>
                            </div>
                          </div>
                        </Match>
                        <Match when={item.approvalState === "pending"}>
                          <div class="rounded border border-warning/50 bg-warning/5 p-2">
                            <div class="flex items-center gap-1.5 mb-1.5">
                              <Badge variant="warning" class="text-2xs">
                                Approval
                              </Badge>
                            </div>
                            <div class="mb-1.5 text-2xs text-text">{item.text}</div>
                            <div class="flex items-center gap-1">
                              <Button variant="default" size="xs" class="bg-success pointer-events-none">
                                Approve
                              </Button>
                              <Button variant="outline" size="xs" class="pointer-events-none">
                                Reject
                              </Button>
                            </div>
                          </div>
                        </Match>
                      </Switch>
                    </div>
                  </div>
                </Match>
                <Match when={item.type === "widget" && item.widget}>
                  <div class="pl-7">
                    <OutputItemRenderer
                      item={
                        {
                          id: item.id,
                          kind: item.widget!.type,
                          name: item.widget!.title ?? null,
                          payload:
                            item.widget!.type === "table"
                              ? item.widget!.table
                              : item.widget!.type === "chart"
                                ? item.widget!.chart
                                : item.widget!.type === "markdown"
                                  ? item.widget!.markdown
                                  : item.widget!.type === "key_value"
                                    ? item.widget!.keyValue
                                    : {},
                        } as OutputItem
                      }
                      compact
                    />
                  </div>
                </Match>
                <Match when={item.type === "question" && item.question}>
                  <div class="flex gap-2">
                    <AgentAvatar icon={props.agent?.icon} iconColor={props.agent?.iconColor} size={20} />
                    <div class="flex-1 min-w-0">
                      <Switch>
                        <Match when={item.questionState === "answered"}>
                          <div class="rounded border border-success/50 bg-success/5 p-2">
                            <div class="flex items-center gap-1.5 mb-1">
                              <Badge variant="success" class="text-2xs">
                                Answered
                              </Badge>
                            </div>
                            <div class="text-2xs text-text">{item.question!.question}</div>
                            <div class="mt-1 text-2xs text-text-muted">
                              → {item.question!.options[item.question!.selectedIndex ?? 0]?.label}
                            </div>
                          </div>
                        </Match>
                        <Match when={item.questionState === "selecting"}>
                          <div class="rounded border border-accent/50 bg-accent/5 p-2">
                            <div class="flex items-center gap-1.5 mb-1.5">
                              <Badge variant="default" class="text-2xs">
                                Question
                              </Badge>
                            </div>
                            <div class="mb-2 text-2xs text-text">{item.question!.question}</div>
                            <div class="space-y-1">
                              <For each={item.question!.options}>
                                {(opt, idx) => (
                                  <div
                                    class={`rounded px-2 py-1 text-2xs ${idx() === (item.question!.selectedIndex ?? 0) ? "bg-accent text-white" : "bg-surface-muted text-text-muted"}`}
                                  >
                                    {opt.label}
                                  </div>
                                )}
                              </For>
                            </div>
                          </div>
                        </Match>
                        <Match when={item.questionState === "pending"}>
                          <div class="rounded border border-accent/50 bg-accent/5 p-2">
                            <div class="flex items-center gap-1.5 mb-1.5">
                              <Badge variant="default" class="text-2xs">
                                Question
                              </Badge>
                            </div>
                            <div class="mb-2 text-2xs text-text">{item.question!.question}</div>
                            <div class="space-y-1">
                              <For each={item.question!.options}>
                                {(opt) => (
                                  <div class="rounded bg-surface-muted px-2 py-1 text-2xs text-text-muted">
                                    {opt.label}
                                  </div>
                                )}
                              </For>
                            </div>
                          </div>
                        </Match>
                      </Switch>
                    </div>
                  </div>
                </Match>
                <Match when={item.type === "select_rows" && item.selectRows}>
                  <div class="flex gap-2">
                    <AgentAvatar icon={props.agent?.icon} iconColor={props.agent?.iconColor} size={20} />
                    <div class="flex-1 min-w-0">
                      <Switch>
                        <Match when={item.selectRowsState === "selected"}>
                          <div class="rounded border border-success/50 bg-success/5 p-2">
                            <div class="flex items-center gap-1.5 mb-1">
                              <Badge variant="success" class="text-2xs">
                                Selected
                              </Badge>
                              <span class="text-2xs text-text-muted">
                                {item.selectRows!.selectedIndices.length} row(s)
                              </span>
                            </div>
                            <div class="rounded border border-border overflow-hidden">
                              <table class="w-full text-2xs">
                                <thead class="bg-surface-muted">
                                  <tr>
                                    <For each={item.selectRows!.columns}>
                                      {(col) => <th class="px-2 py-1 text-left text-text-muted">{col.label}</th>}
                                    </For>
                                  </tr>
                                </thead>
                                <tbody>
                                  <For each={item.selectRows!.selectedIndices}>
                                    {(idx) => (
                                      <tr class="border-t border-border bg-success/10">
                                        <For each={item.selectRows!.columns}>
                                          {(col) => (
                                            <td class="px-2 py-1 text-text">
                                              {String(item.selectRows!.data[idx]?.[col.key] ?? "")}
                                            </td>
                                          )}
                                        </For>
                                      </tr>
                                    )}
                                  </For>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </Match>
                        <Match when={true}>
                          <div class="rounded border border-accent/50 bg-accent/5 p-2">
                            <div class="flex items-center gap-1.5 mb-1.5">
                              <Badge variant="default" class="text-2xs">
                                Select rows
                              </Badge>
                              <Show when={item.selectRowsState === "selecting"}>
                                <Spinner size="xs" />
                              </Show>
                            </div>
                            <div class="rounded border border-border overflow-hidden">
                              <table class="w-full text-2xs">
                                <thead class="bg-surface-muted">
                                  <tr>
                                    <th class="w-6 px-2 py-1" />
                                    <For each={item.selectRows!.columns}>
                                      {(col) => <th class="px-2 py-1 text-left text-text-muted">{col.label}</th>}
                                    </For>
                                  </tr>
                                </thead>
                                <tbody>
                                  <For each={item.selectRows!.data.slice(0, 3)}>
                                    {(row, idx) => (
                                      <tr
                                        class={`border-t border-border ${item.selectRowsState === "selecting" && item.selectRows!.selectedIndices.includes(idx()) ? "bg-accent/10" : ""}`}
                                      >
                                        <td class="w-6 px-2 py-1">
                                          <div
                                            class={`w-3 h-3 rounded border ${item.selectRowsState === "selecting" && item.selectRows!.selectedIndices.includes(idx()) ? "border-accent bg-accent" : "border-border"}`}
                                          />
                                        </td>
                                        <For each={item.selectRows!.columns}>
                                          {(col) => <td class="px-2 py-1 text-text">{String(row[col.key] ?? "")}</td>}
                                        </For>
                                      </tr>
                                    )}
                                  </For>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </Match>
                      </Switch>
                    </div>
                  </div>
                </Match>
                <Match when={item.type === "confirm" && item.confirm}>
                  <div class="flex gap-2">
                    <AgentAvatar icon={props.agent?.icon} iconColor={props.agent?.iconColor} size={20} />
                    <div class="flex-1 min-w-0">
                      <Switch>
                        <Match when={item.confirmState === "confirmed"}>
                          <div class="rounded border border-success/50 bg-success/5 p-2">
                            <div class="flex items-center gap-1.5">
                              <Badge variant="success" class="text-2xs">
                                Confirmed
                              </Badge>
                              <span class="text-2xs text-text-muted truncate">{item.confirm!.message}</span>
                            </div>
                          </div>
                        </Match>
                        <Match when={true}>
                          {(() => {
                            const v = item.confirm!.variant ?? "info"
                            const border =
                              v === "danger"
                                ? "border-danger/50"
                                : v === "warning"
                                  ? "border-warning/50"
                                  : "border-accent/50"
                            const bg = v === "danger" ? "bg-danger/5" : v === "warning" ? "bg-warning/5" : "bg-accent/5"
                            const Icon = v === "danger" ? WarningOctagon : v === "warning" ? Warning : Info
                            const iconColor =
                              v === "danger" ? "text-danger" : v === "warning" ? "text-warning" : "text-accent"
                            return (
                              <div class={`rounded border p-2 ${border} ${bg}`}>
                                <div class="flex items-start gap-2 mb-2">
                                  <Icon class={`h-4 w-4 shrink-0 ${iconColor}`} weight="fill" />
                                  <span class="text-2xs text-text">{item.confirm!.message}</span>
                                </div>
                                <div class="flex items-center gap-1">
                                  <Show when={item.confirmState === "confirming"}>
                                    <Button variant="default" size="xs" class="bg-success pointer-events-none">
                                      <Spinner size="xs" class="border-white border-t-transparent" />
                                    </Button>
                                  </Show>
                                  <Show when={item.confirmState === "pending"}>
                                    <Button variant="default" size="xs" class="bg-success pointer-events-none">
                                      Confirm
                                    </Button>
                                    <Button variant="outline" size="xs" class="pointer-events-none">
                                      Reject
                                    </Button>
                                  </Show>
                                </div>
                              </div>
                            )
                          })()}
                        </Match>
                      </Switch>
                    </div>
                  </div>
                </Match>
              </Switch>
            )}
          </For>

          <Show when={isThinking()}>
            <div class="flex gap-2">
              <div class="relative flex items-center justify-center">
                <span
                  class="absolute h-5 w-5 animate-ping rounded-full opacity-30"
                  style={{ "background-color": colorValue() }}
                />
                <AgentAvatar icon={props.agent?.icon} iconColor={props.agent?.iconColor} size={20} />
              </div>
              <div class="flex items-center">
                <span class="text-xs text-text-muted">Working on it...</span>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  )
}
