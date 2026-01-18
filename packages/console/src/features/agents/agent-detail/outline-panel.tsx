import { Show, Index, For, type JSX } from "solid-js"
import { Code, Plus, DotsThree, BracketsCurly, Database, Gear, UsersThree } from "phosphor-solid-js"
import type { AgentRuntimeConfig } from "@synatra/core/types"
import { getSystemTools, type SystemToolDefinition } from "@synatra/core/system-tools"
import { DropdownMenu, type DropdownMenuItem } from "../../../ui"
import type { Agents } from "../../../app/api"
import type { Selection } from "./constants"

type OutlinePanelProps = {
  config: AgentRuntimeConfig | null
  agentName: string
  agents: Agents
  selection: Selection | null
  onSelect: (selection: Selection) => void
  onAddTool: () => void
  onGenerateFromDatabase: () => void
  onRemoveTool: (index: number) => void
  onAddType: () => void
  onRemoveType: (name: string) => void
  onAddSubagent: () => void
  onRemoveSubagent: (index: number) => void
}

type SectionHeaderProps = {
  icon: JSX.Element
  label: string
  count?: number
  onAdd?: () => void
  addMenu?: JSX.Element
}

function SectionHeader(props: SectionHeaderProps) {
  return (
    <div class="flex items-center justify-between px-3 py-2 text-xs">
      <div class="flex items-center gap-2">
        {props.icon}
        <span class="font-medium text-text">{props.label}</span>
        <Show when={props.count !== undefined}>
          <span class="text-[10px] text-text-muted">({props.count})</span>
        </Show>
      </div>
      <Show
        when={props.addMenu}
        fallback={
          <Show when={props.onAdd}>
            <button
              type="button"
              class="rounded p-0.5 text-text-muted transition-colors hover:text-text"
              onClick={props.onAdd}
            >
              <Plus class="h-3 w-3" />
            </button>
          </Show>
        }
      >
        {props.addMenu}
      </Show>
    </div>
  )
}

type TreeItemProps = {
  label: string
  sublabel?: string
  selected: boolean
  onClick: () => void
  onDelete?: () => void
  code?: boolean
}

function TreeItem(props: TreeItemProps) {
  const menuItems = (): DropdownMenuItem[] => [
    { type: "item", label: "Delete", onClick: () => props.onDelete?.(), variant: "danger" },
  ]

  return (
    <button
      type="button"
      class="group flex w-full items-center gap-2 py-1 pl-7 pr-3 text-xs text-text transition-colors"
      classList={{
        "bg-surface-muted": props.selected,
        "hover:bg-surface-muted": !props.selected,
      }}
      onClick={props.onClick}
    >
      <span class="truncate" classList={{ "font-code": props.code }}>
        {props.label}
      </span>
      <Show when={props.sublabel}>
        <span class="ml-auto truncate text-[10px] text-text-muted group-hover:hidden">{props.sublabel}</span>
      </Show>
      <Show when={props.onDelete}>
        <span class="ml-auto hidden group-hover:block">
          <DropdownMenu
            items={menuItems()}
            trigger={
              <span class="text-text-muted hover:text-text">
                <DotsThree class="h-3.5 w-3.5" />
              </span>
            }
          />
        </span>
      </Show>
    </button>
  )
}

export function OutlinePanel(props: OutlinePanelProps) {
  const isSelected = (type: Selection["type"], indexOrName?: number | string): boolean => {
    if (!props.selection) return false
    if (props.selection.type !== type) return false
    if (type === "tool" && props.selection.type === "tool") {
      return props.selection.index === indexOrName
    }
    if (type === "type" && props.selection.type === "type") {
      return props.selection.name === indexOrName
    }
    if (type === "system_tool" && props.selection.type === "system_tool") {
      return props.selection.name === indexOrName
    }
    if (type === "subagent" && props.selection.type === "subagent") {
      return props.selection.index === indexOrName
    }
    return true
  }

  const toolCount = () => props.config?.tools?.length ?? 0
  const typeNames = () => Object.keys(props.config?.$defs ?? {})
  const subagentCount = () => props.config?.subagents?.length ?? 0

  const getSubagentName = (agentId: string) => {
    const agent = props.agents.find((a) => a.id === agentId)
    return agent?.name ?? "Unknown"
  }

  return (
    <div class="flex h-full flex-col overflow-y-auto bg-surface-elevated py-1 scrollbar-thin">
      <div>
        <SectionHeader icon={<Gear class="h-3 w-3 text-text-muted" weight="duotone" />} label="General" />
        <TreeItem label="Model" selected={isSelected("model")} onClick={() => props.onSelect({ type: "model" })} />
        <TreeItem label="Prompt" selected={isSelected("prompt")} onClick={() => props.onSelect({ type: "prompt" })} />
      </div>

      <div class="mt-2 border-t border-border">
        <SectionHeader
          icon={<BracketsCurly class="h-3 w-3 text-accent" weight="duotone" />}
          label="Types"
          count={typeNames().length}
          onAdd={props.onAddType}
        />
        <Show
          when={typeNames().length > 0}
          fallback={<div class="px-2 py-1 pl-7 text-[10px] italic text-text-muted">No types</div>}
        >
          <For each={typeNames()}>
            {(name) => (
              <TreeItem
                label={name}
                selected={isSelected("type", name)}
                onClick={() => props.onSelect({ type: "type", name })}
                onDelete={() => props.onRemoveType(name)}
                code
              />
            )}
          </For>
        </Show>
      </div>

      <div class="mt-2 border-t border-border">
        <SectionHeader
          icon={<Code class="h-3 w-3 text-success" weight="duotone" />}
          label="Tools"
          count={toolCount()}
          addMenu={
            <DropdownMenu
              items={[
                {
                  type: "item",
                  label: "Custom tool",
                  icon: <Code class="h-3.5 w-3.5 text-success" weight="duotone" />,
                  onClick: props.onAddTool,
                },
                {
                  type: "item",
                  label: "Generate from resource",
                  icon: <Database class="h-3.5 w-3.5 text-accent" weight="duotone" />,
                  onClick: props.onGenerateFromDatabase,
                },
              ]}
              trigger={
                <button type="button" class="rounded p-0.5 text-text-muted transition-colors hover:text-text">
                  <Plus class="h-3 w-3" />
                </button>
              }
            />
          }
        />
        <Show
          when={toolCount() > 0}
          fallback={<div class="px-2 py-1 pl-7 text-[10px] italic text-text-muted">No tools configured</div>}
        >
          <Index each={props.config?.tools ?? []}>
            {(tool, index) => (
              <TreeItem
                label={`${tool().name}()`}
                selected={isSelected("tool", index)}
                onClick={() => props.onSelect({ type: "tool", index })}
                onDelete={() => props.onRemoveTool(index)}
                code
              />
            )}
          </Index>
        </Show>
      </div>

      <div class="mt-2 border-t border-border">
        <SectionHeader
          icon={<UsersThree class="h-3 w-3 text-warning" weight="duotone" />}
          label="Subagents"
          count={subagentCount()}
          onAdd={props.onAddSubagent}
        />
        <Show
          when={subagentCount() > 0}
          fallback={<div class="px-2 py-1 pl-7 text-[10px] italic text-text-muted">No subagents</div>}
        >
          <Index each={props.config?.subagents ?? []}>
            {(subagent, index) => (
              <TreeItem
                label={getSubagentName(subagent().agentId)}
                selected={isSelected("subagent", index)}
                onClick={() => props.onSelect({ type: "subagent", index })}
                onDelete={() => props.onRemoveSubagent(index)}
              />
            )}
          </Index>
        </Show>
      </div>

      <div class="mt-2 border-t border-border">
        <SectionHeader icon={<Gear class="h-3 w-3 text-text-muted" weight="duotone" />} label="System tools" />
        <For each={getSystemTools()}>
          {(tool: SystemToolDefinition) => (
            <TreeItem
              label={`${tool.name}()`}
              selected={isSelected("system_tool", tool.name)}
              onClick={() => props.onSelect({ type: "system_tool", name: tool.name })}
              code
            />
          )}
        </For>
      </div>
    </div>
  )
}
