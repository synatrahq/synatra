import { Show, createSignal, createEffect, on } from "solid-js"
import type { SubagentDefinition } from "@synatra/core/types"
import { Input, Select, FormField, CollapsibleSection } from "../../../../ui"
import { api } from "../../../../app"
import type { Agents } from "../../../../app/api"
import { versionModeOptions } from "./constants"

type ReleaseInfo = { id: string; version: string }

export function SubagentInspector(props: {
  subagent: SubagentDefinition
  agents: Agents
  currentAgentId: string
  onUpdate: (subagent: SubagentDefinition) => void
}) {
  const [releases, setReleases] = createSignal<ReleaseInfo[]>([])

  const availableAgents = () => props.agents.filter((a) => a.id !== props.currentAgentId)

  const agentOptions = () =>
    availableAgents().map((a) => ({
      value: a.id,
      label: a.name,
    }))

  const selectedAgent = () => props.agents.find((a) => a.id === props.subagent.agentId)

  const releaseOptions = () =>
    releases().map((r) => ({
      value: r.id,
      label: r.version,
    }))

  const fetchReleases = async (agentId: string) => {
    if (!agentId) {
      setReleases([])
      return
    }
    try {
      const res = await api.api.agents[":id"].releases.$get({ param: { id: agentId } })
      if (res.ok) {
        const data = await res.json()
        setReleases(data.map((r) => ({ id: r.id, version: r.version })))
      }
    } catch {
      setReleases([])
    }
  }

  createEffect(
    on(
      () => props.subagent.agentId,
      (id) => fetchReleases(id),
    ),
  )

  const updateField = <K extends keyof SubagentDefinition>(key: K, value: SubagentDefinition[K]) => {
    props.onUpdate({ ...props.subagent, [key]: value })
  }

  const handleAgentChange = (agentId: string) => {
    const agent = props.agents.find((a) => a.id === agentId)
    const updated: SubagentDefinition = {
      ...props.subagent,
      agentId,
      alias: agent?.slug,
    }
    if (props.subagent.versionMode === "fixed") {
      updated.releaseId = agent?.currentReleaseId ?? undefined
    }
    props.onUpdate(updated)
  }

  const handleVersionModeChange = (mode: "current" | "fixed") => {
    const updated: SubagentDefinition = { ...props.subagent, versionMode: mode }
    if (mode === "current") {
      delete updated.releaseId
    } else if (mode === "fixed") {
      const agent = selectedAgent()
      updated.releaseId = agent?.currentReleaseId ?? undefined
    }
    props.onUpdate(updated)
  }

  return (
    <div class="space-y-0">
      <CollapsibleSection title="Settings">
        <div class="space-y-3">
          <FormField horizontal labelWidth="6rem" label="Agent">
            <Select
              value={props.subagent.agentId}
              options={agentOptions()}
              onChange={handleAgentChange}
              placeholder="Select an agent"
            />
          </FormField>
          <FormField horizontal labelWidth="6rem" label="Alias">
            <Input
              type="text"
              value={props.subagent.alias ?? ""}
              onInput={(e) => updateField("alias", e.currentTarget.value || undefined)}
              class="text-xs font-code"
              placeholder={selectedAgent()?.slug ?? "alias"}
            />
          </FormField>
          <FormField horizontal labelWidth="6rem" label="Description">
            <Input
              type="text"
              value={props.subagent.description}
              onInput={(e) => updateField("description", e.currentTarget.value)}
              class="text-xs"
              placeholder="What this subagent handles"
            />
          </FormField>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Version">
        <div class="space-y-3">
          <FormField horizontal labelWidth="6rem" label="Mode">
            <Select
              value={props.subagent.versionMode}
              options={versionModeOptions}
              onChange={handleVersionModeChange}
            />
          </FormField>
          <Show when={props.subagent.versionMode === "fixed"}>
            <FormField horizontal labelWidth="6rem" label="Release">
              <Select
                value={props.subagent.releaseId ?? ""}
                options={releaseOptions()}
                onChange={(v) => updateField("releaseId", v || undefined)}
                placeholder="Select a release"
              />
            </FormField>
          </Show>
        </div>
      </CollapsibleSection>

      <Show when={selectedAgent()}>
        {(agent) => (
          <CollapsibleSection title="Preview">
            <div class="space-y-2 text-xs">
              <div class="flex items-center gap-2">
                <span class="text-text-muted">Tool name:</span>
                <code class="font-code text-accent">delegate_to_{props.subagent.alias || agent().slug}()</code>
              </div>
              <div class="rounded border border-border bg-surface-muted p-2 text-text-muted">
                <p>{props.subagent.description || "No description"}</p>
              </div>
            </div>
          </CollapsibleSection>
        )}
      </Show>
    </div>
  )
}
