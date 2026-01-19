import { createSignal, createEffect, Show, For } from "solid-js"
import { X, Command, Hash } from "phosphor-solid-js"
import { api } from "../../app"
import type { Environments, Channels, ChannelAgents, AgentPrompt } from "../../app/api"
import { Modal, Button, Spinner, Textarea, Select } from "../../ui"
import { getIconComponent, ICON_COLORS } from "../../components"
import { PromptSelector } from "./prompt-selector"
import { PromptForm, initFormValues } from "./prompt-form"

type ChannelAgent = ChannelAgents[number]["agent"]
type PromptMode = "none" | "selecting" | "form"

type SelectionStep = "channel" | "agent" | "done"

type ComposeModalProps = {
  open: boolean
  defaultChannelId?: string | null
  onClose: () => void
  onSent?: (threadId: string, channelSlug: string, message: string | null) => void
}

export function ComposeModal(props: ComposeModalProps) {
  const [agents, setAgents] = createSignal<ChannelAgent[]>([])
  const [environments, setEnvironments] = createSignal<Environments>([])
  const [channels, setChannels] = createSignal<Channels>([])
  const [selectedAgent, setSelectedAgent] = createSignal<ChannelAgent | null>(null)
  const [selectedEnvironment, setSelectedEnvironment] = createSignal<string>("")
  const [selectedChannel, setSelectedChannel] = createSignal<Channels[number] | null>(null)
  const [message, setMessage] = createSignal("")
  const [sending, setSending] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [searchQuery, setSearchQuery] = createSignal("")
  const [showDropdown, setShowDropdown] = createSignal(false)
  const [highlightedIndex, setHighlightedIndex] = createSignal(0)

  const [promptMode, setPromptMode] = createSignal<PromptMode>("none")
  const [selectedPrompt, setSelectedPrompt] = createSignal<AgentPrompt | null>(null)
  const [promptQuery, setPromptQuery] = createSignal("")
  const [promptFormValues, setPromptFormValues] = createSignal<Record<string, unknown>>({})
  const [promptFormTouched, setPromptFormTouched] = createSignal<Record<string, boolean>>({})

  let inputRef: HTMLInputElement | undefined
  let textareaRef: HTMLTextAreaElement | undefined

  const step = (): SelectionStep => {
    if (!selectedChannel()) return "channel"
    if (!selectedAgent()) return "agent"
    return "done"
  }

  const placeholder = () => {
    if (step() === "channel") return "Select a channel..."
    if (step() === "agent") return "Select an agent..."
    return ""
  }

  const filteredChannels = () => {
    const query = searchQuery().toLowerCase()
    return channels().filter((c) => c.name.toLowerCase().includes(query) || c.slug.toLowerCase().includes(query))
  }

  const filteredAgents = () => {
    const query = searchQuery().toLowerCase()
    return agents().filter((a) => a.name.toLowerCase().includes(query) || a.slug.toLowerCase().includes(query))
  }

  const currentOptions = () => {
    if (step() === "channel") return filteredChannels()
    if (step() === "agent") return filteredAgents()
    return []
  }

  const fetchData = async () => {
    try {
      const [envsRes, channelsRes] = await Promise.all([
        api.api.environments.$get(),
        api.api.channels.$get({ query: {} }),
      ])

      if (envsRes.ok) {
        const data = await envsRes.json()
        setEnvironments(data)
        if (data.length > 0 && !selectedEnvironment()) {
          setSelectedEnvironment(data[0].id)
        }
      }

      if (channelsRes.ok) {
        const data = await channelsRes.json()
        setChannels(data)

        if (props.defaultChannelId) {
          const defaultChannel = data.find((c) => c.id === props.defaultChannelId)
          if (defaultChannel) {
            setSelectedChannel(defaultChannel)
            await fetchChannelAgents(defaultChannel.id)
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch data", e)
    }
  }

  const fetchChannelAgents = async (channelId: string) => {
    try {
      const res = await api.api.channels[":channelId"].agents.$get({ param: { channelId } })
      if (res.ok) {
        const data = await res.json()
        setAgents(data.map((d) => d.agent))
      }
    } catch (e) {
      console.error("Failed to fetch channel agents", e)
    }
  }

  createEffect(() => {
    if (props.open) {
      setSelectedAgent(null)
      setSelectedChannel(null)
      setAgents([])
      setMessage("")
      setError(null)
      setSearchQuery("")
      setShowDropdown(true)
      setHighlightedIndex(0)
      resetPromptState()
      fetchData()
    }
  })

  createEffect(() => {
    if (props.open && step() !== "done") {
      setTimeout(() => inputRef?.focus(), 50)
    }
  })

  createEffect(() => {
    if (step() === "done" && props.open) {
      setTimeout(() => textareaRef?.focus(), 50)
    }
  })

  const handleSelectChannel = async (channel: Channels[number]) => {
    setSelectedChannel(channel)
    setSearchQuery("")
    setHighlightedIndex(0)
    setShowDropdown(true)
    await fetchChannelAgents(channel.id)
  }

  const handleSelectAgent = (agent: ChannelAgent) => {
    setSelectedAgent(agent)
    setSearchQuery("")
    setShowDropdown(false)
    resetPromptState()
  }

  const handleRemoveChannel = () => {
    setSelectedChannel(null)
    setSelectedAgent(null)
    setAgents([])
    setSearchQuery("")
    setShowDropdown(true)
    resetPromptState()
    setTimeout(() => inputRef?.focus(), 0)
  }

  const handleRemoveAgent = () => {
    setSelectedAgent(null)
    setSearchQuery("")
    setShowDropdown(true)
    resetPromptState()
    setTimeout(() => inputRef?.focus(), 0)
  }

  const handleInputKeyDown = (e: KeyboardEvent) => {
    const options = currentOptions()

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlightedIndex((i) => Math.min(i + 1, options.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlightedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const selected = options[highlightedIndex()]
      if (selected) {
        if (step() === "channel") {
          handleSelectChannel(selected as Channels[number])
        } else if (step() === "agent") {
          handleSelectAgent(selected as ChannelAgent)
        }
      }
    } else if (e.key === "Backspace" && searchQuery() === "") {
      if (selectedAgent()) {
        handleRemoveAgent()
      } else if (selectedChannel()) {
        handleRemoveChannel()
      }
    }
  }

  const canSend = () =>
    selectedAgent() && selectedEnvironment() && selectedChannel() && message().trim().length > 0 && !sending()

  const parseError = async (res: Response): Promise<string> => {
    const body = await res.json().catch(() => ({}))
    return (body as { message?: string }).message || "Failed to send"
  }

  const handleSend = async () => {
    if (!canSend()) return

    setSending(true)
    setError(null)

    const res = await api.api.threads
      .$post({
        json: {
          agentId: selectedAgent()!.id,
          environmentId: selectedEnvironment(),
          channelId: selectedChannel()!.id,
          subject: message().trim().slice(0, 50) || "New request",
          message: message().trim(),
        },
      })
      .catch(() => null)

    setSending(false)

    if (!res) {
      setError("Failed to send")
      return
    }

    if (!res.ok) {
      setError(await parseError(res))
      return
    }

    const data = await res.json()
    props.onSent?.(data.id, selectedChannel()!.slug, message())
    handleClose()
  }

  const resetPromptState = () => {
    setPromptMode("none")
    setSelectedPrompt(null)
    setPromptQuery("")
    setPromptFormValues({})
    setPromptFormTouched({})
  }

  const handleClose = () => {
    setSelectedAgent(null)
    setSelectedChannel(null)
    setMessage("")
    setError(null)
    setSearchQuery("")
    setShowDropdown(false)
    resetPromptState()
    props.onClose()
  }

  const handleTextareaKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && e.metaKey && canSend()) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleMessageInput = (val: string) => {
    if (val.startsWith("/") && message() === "" && promptMode() === "none" && selectedAgent()) {
      setPromptMode("selecting")
      setPromptQuery(val.slice(1))
      return
    }
    setMessage(val)
  }

  const handlePromptSelect = (prompt: AgentPrompt) => {
    setSelectedPrompt(prompt)
    setPromptMode("form")
    setPromptFormValues(initFormValues(prompt))
    setPromptFormTouched({})
  }

  const handlePromptCancel = () => {
    resetPromptState()
    setMessage("")
    setTimeout(() => textareaRef?.focus(), 0)
  }

  const handlePromptFormBlur = (name: string) => {
    setPromptFormTouched((prev) => ({ ...prev, [name]: true }))
  }

  const handlePromptSubmit = async () => {
    const prompt = selectedPrompt()
    const agent = selectedAgent()
    const env = selectedEnvironment()
    const channel = selectedChannel()
    if (!prompt || !agent || !env || !channel) return

    setSending(true)
    setError(null)

    const res = await api.api.threads
      .$post({
        json: {
          agentId: agent.id,
          environmentId: env,
          channelId: channel.id,
          subject: prompt.name,
          promptId: prompt.id,
          promptInput: promptFormValues(),
        },
      })
      .catch(() => null)

    setSending(false)

    if (!res) {
      setError("Failed to send")
      return
    }

    if (!res.ok) {
      setError(await parseError(res))
      return
    }

    const data = await res.json()
    props.onSent?.(data.id, channel.slug, null)
    handleClose()
  }

  return (
    <Modal open={props.open} onEscape={handleClose} onBackdropClick={handleClose} contentClass="w-full max-w-[640px]">
      <div class="pointer-events-auto flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-elevated">
        <div class="relative border-b border-border px-3 py-2">
          <div class="flex items-center gap-2">
            <span class="text-xs text-text-muted">To:</span>
            <div class="flex flex-1 flex-wrap items-center gap-1.5">
              <Show when={selectedChannel()}>
                {(channel) => (
                  <span class="flex items-center gap-1 rounded bg-surface-muted px-1.5 py-0.5 text-xs text-text">
                    <Hash class="h-3 w-3 text-text-muted" weight="bold" />
                    <span>{channel().name}</span>
                    <button
                      type="button"
                      onClick={handleRemoveChannel}
                      class="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-text-muted hover:bg-surface hover:text-text"
                    >
                      <X class="h-2.5 w-2.5" />
                    </button>
                  </span>
                )}
              </Show>
              <Show when={selectedAgent()}>
                {(agent) => {
                  const IconComponent = getIconComponent(agent().icon)
                  const colorValue = ICON_COLORS.find((c) => c.id === agent().iconColor)?.value ?? ICON_COLORS[0].value
                  return (
                    <span class="flex items-center gap-1 rounded bg-surface-muted px-1.5 py-0.5 text-xs text-text">
                      {IconComponent ? (
                        <IconComponent class="h-3 w-3" weight="duotone" style={{ color: colorValue }} />
                      ) : (
                        <span class="h-3 w-3" />
                      )}
                      <span>{agent().name}</span>
                      <button
                        type="button"
                        onClick={handleRemoveAgent}
                        class="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-text-muted hover:bg-surface hover:text-text"
                      >
                        <X class="h-2.5 w-2.5" />
                      </button>
                    </span>
                  )
                }}
              </Show>
              <Show when={step() !== "done"}>
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery()}
                  onInput={(e) => {
                    setSearchQuery(e.currentTarget.value)
                    setHighlightedIndex(0)
                  }}
                  onFocus={() => setShowDropdown(true)}
                  onKeyDown={handleInputKeyDown}
                  placeholder={placeholder()}
                  autocomplete="off"
                  class="min-w-[120px] flex-1 bg-transparent text-xs text-text placeholder:text-text-muted focus:outline-none"
                />
              </Show>
            </div>
            <button
              type="button"
              onClick={handleClose}
              class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
            >
              <X class="h-3.5 w-3.5" />
            </button>
          </div>

          <Show when={showDropdown() && step() !== "done" && currentOptions().length > 0}>
            <div class="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-surface-floating shadow-lg">
              <Show when={step() === "channel"}>
                <For each={filteredChannels()}>
                  {(channel, index) => (
                    <button
                      type="button"
                      class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors"
                      classList={{
                        "bg-surface-muted": highlightedIndex() === index(),
                        "hover:bg-surface-muted": highlightedIndex() !== index(),
                      }}
                      onClick={() => handleSelectChannel(channel)}
                      onMouseEnter={() => setHighlightedIndex(index())}
                    >
                      <Hash class="h-3.5 w-3.5 text-text-muted" weight="bold" />
                      <span class="text-text">{channel.name}</span>
                      <span class="text-text-muted">{channel.slug}</span>
                    </button>
                  )}
                </For>
              </Show>
              <Show when={step() === "agent"}>
                <For each={filteredAgents()}>
                  {(agent, index) => {
                    const IconComponent = getIconComponent(agent.icon)
                    const colorValue = ICON_COLORS.find((c) => c.id === agent.iconColor)?.value ?? ICON_COLORS[0].value
                    return (
                      <button
                        type="button"
                        class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors"
                        classList={{
                          "bg-surface-muted": highlightedIndex() === index(),
                          "hover:bg-surface-muted": highlightedIndex() !== index(),
                        }}
                        onClick={() => handleSelectAgent(agent)}
                        onMouseEnter={() => setHighlightedIndex(index())}
                      >
                        {IconComponent ? (
                          <IconComponent class="h-3.5 w-3.5" weight="duotone" style={{ color: colorValue }} />
                        ) : (
                          <span class="h-3.5 w-3.5" />
                        )}
                        <span class="text-text">{agent.name}</span>
                        <span class="text-text-muted">{agent.slug}</span>
                      </button>
                    )
                  }}
                </For>
              </Show>
            </div>
          </Show>
        </div>

        <div class="px-3 py-3">
          <Show when={promptMode() === "none"}>
            <Textarea
              ref={textareaRef}
              value={message()}
              onInput={(e) => handleMessageInput(e.currentTarget.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder="Describe what you'd like the agent to do... (Type / for prompts)"
              variant="surface"
              class="min-h-[180px] resize-none shadow-none focus-visible:shadow-none !p-0"
              rows={8}
            />
          </Show>
          <Show when={promptMode() === "selecting"}>
            <PromptSelector
              agentId={selectedAgent()?.id ?? null}
              query={promptQuery()}
              onQueryChange={setPromptQuery}
              onSelect={handlePromptSelect}
              onCancel={handlePromptCancel}
            />
          </Show>
          <Show when={promptMode() === "form" && selectedPrompt()}>
            <PromptForm
              prompt={selectedPrompt()!}
              formValues={promptFormValues()}
              touched={promptFormTouched()}
              onFormChange={setPromptFormValues}
              onBlur={handlePromptFormBlur}
              onCancel={handlePromptCancel}
              onSubmit={handlePromptSubmit}
              submitting={sending()}
            />
          </Show>
        </div>

        <Show when={error()}>
          <div class="border-t border-danger bg-danger-soft/30 px-3 py-2">
            <p class="text-2xs text-danger">{error()}</p>
          </div>
        </Show>

        <Show when={promptMode() === "none"}>
          <div class="flex items-center justify-between border-t border-border px-3 py-2">
            <div class="flex items-center gap-2">
              <Show when={environments().length > 1}>
                <Select
                  value={selectedEnvironment()}
                  options={environments().map((env) => ({ value: env.id, label: env.name }))}
                  onChange={setSelectedEnvironment}
                  wrapperClass="w-36"
                />
              </Show>
            </div>
            <div class="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleClose}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSend} disabled={!canSend()}>
                {sending() && <Spinner size="xs" class="border-white border-t-transparent" />}
                <span>{sending() ? "Sending..." : "Send"}</span>
                <Show when={!sending()}>
                  <div class="flex items-center gap-0.5 rounded bg-white/10 px-1 py-0.5">
                    <Command class="h-3 w-3" />
                    <span class="text-[10px]">↵</span>
                  </div>
                </Show>
              </Button>
            </div>
          </div>
        </Show>
      </div>
    </Modal>
  )
}
