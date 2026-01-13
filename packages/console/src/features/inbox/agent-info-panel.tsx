import { Show, For, createSignal, createEffect } from "solid-js"
import { A } from "@solidjs/router"
import { X, Robot, Wrench, ArrowSquareOut } from "phosphor-solid-js"
import { IconButton, Skeleton } from "../../ui"
import { EntityIcon } from "../../components"
import { api } from "../../app"

type AgentInfo = {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string
  iconColor: string
  runtimeConfig: {
    tools?: { name: string; description: string }[]
    triggers?: { id: string; type: string }[]
  }
  createdAt: string
  updatedAt: string
}

type AgentInfoPanelProps = {
  agentId: string
  onClose: () => void
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function AgentInfoPanel(props: AgentInfoPanelProps) {
  const [agent, setAgent] = createSignal<AgentInfo | null>(null)
  const [loading, setLoading] = createSignal(true)

  createEffect(() => {
    const id = props.agentId
    if (!id) return

    setLoading(true)
    api.api.agents[":id"]
      .$get({ param: { id } })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json()
          setAgent(data as AgentInfo)
        }
      })
      .catch((e) => console.error("Failed to fetch agent", e))
      .finally(() => setLoading(false))
  })

  return (
    <div class="flex h-full w-[320px] shrink-0 flex-col border-l border-border bg-surface-elevated">
      <div class="flex items-center justify-between px-3 py-1.5">
        <span class="text-xs font-medium text-text">Agent</span>
        <IconButton variant="ghost" size="xs" onClick={props.onClose}>
          <X class="h-3.5 w-3.5" />
        </IconButton>
      </div>

      <Show when={loading()}>
        <div class="flex flex-col gap-3 p-3">
          <div class="flex items-center gap-2.5">
            <Skeleton class="h-8 w-8 rounded-md" />
            <div class="flex-1 space-y-1.5">
              <Skeleton class="h-3.5 w-28" />
              <Skeleton class="h-2.5 w-16" />
            </div>
          </div>
          <Skeleton class="h-10 w-full" />
          <Skeleton class="h-16 w-full" />
        </div>
      </Show>

      <Show when={!loading() && agent()}>
        {(data) => (
          <div class="flex-1 overflow-y-auto scrollbar-thin">
            <div class="flex flex-col gap-3 p-3">
              <div class="flex items-start gap-2.5">
                <EntityIcon
                  icon={data().icon}
                  iconColor={data().iconColor}
                  size={32}
                  rounded="lg"
                  iconScale={0.55}
                  fallback={Robot}
                />
                <div class="flex-1 min-w-0">
                  <h3 class="text-[13px] font-medium text-text truncate">{data().name}</h3>
                  <p class="text-2xs text-text-muted font-code">{data().slug}</p>
                </div>
              </div>

              <div class="space-y-1">
                <p class="text-2xs font-medium text-text-muted">Details</p>
                <div class="rounded-md border border-border bg-surface-muted/50 px-2.5 py-2 space-y-1.5">
                  <Show when={data().description}>
                    <div class="text-2xs">
                      <span class="text-text-muted">Description</span>
                      <p class="text-text mt-0.5">{data().description}</p>
                    </div>
                  </Show>
                  <div class="flex justify-between text-2xs">
                    <span class="text-text-muted">Created</span>
                    <span class="text-text">{formatDate(data().createdAt)}</span>
                  </div>
                  <div class="flex justify-between text-2xs">
                    <span class="text-text-muted">Updated</span>
                    <span class="text-text">{formatDate(data().updatedAt)}</span>
                  </div>
                </div>
              </div>

              <Show when={data().runtimeConfig.tools && data().runtimeConfig.tools!.length > 0}>
                <div class="space-y-1">
                  <p class="text-2xs font-medium text-text-muted">Tools ({data().runtimeConfig.tools!.length})</p>
                  <div class="rounded-md border border-border bg-surface-muted/50 divide-y divide-border">
                    <For each={data().runtimeConfig.tools}>
                      {(tool) => (
                        <div class="px-2.5 py-1.5">
                          <div class="flex items-center gap-1.5">
                            <Wrench class="h-3 w-3 text-text-muted" />
                            <span class="text-2xs font-code text-text">{tool.name}</span>
                          </div>
                          <Show when={tool.description}>
                            <p class="text-2xs text-text-muted mt-0.5 line-clamp-2">{tool.description}</p>
                          </Show>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              <A
                href={`/agents/${data().id}`}
                class="flex items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-2xs font-medium text-text hover:bg-surface-muted transition-colors"
              >
                <span>View Agent</span>
                <ArrowSquareOut class="h-3 w-3" />
              </A>
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}
