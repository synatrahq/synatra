import { For, Show } from "solid-js"
import type { AgentTemplate } from "@synatra/core/types"
import { EntityIcon, ResourceIcon } from "../../components"

type TemplateCardProps = {
  template: AgentTemplate
  onPreview: () => void
}

export function TemplateCard(props: TemplateCardProps) {
  return (
    <button
      type="button"
      class="flex flex-col gap-2 rounded-md border border-border bg-surface-elevated p-3 text-left transition-colors hover:border-border-strong"
      onClick={props.onPreview}
    >
      <div class="flex items-center gap-3">
        <EntityIcon icon={props.template.icon} iconColor={props.template.iconColor} size={32} rounded="md" />
        <div class="min-w-0 flex-1">
          <h3 class="truncate text-[13px] font-medium leading-5 text-text">{props.template.name}</h3>
          <p class="text-2xs capitalize text-text-muted">{props.template.category.replace("-", " ")}</p>
        </div>
      </div>

      <p class="line-clamp-2 text-[13px] leading-5 text-text-muted">{props.template.description}</p>

      <Show when={props.template.suggestedResources.length > 0}>
        <div class="mt-auto flex items-center gap-1 border-t border-border pt-2">
          <For each={props.template.suggestedResources}>
            {(r) => <ResourceIcon type={r} class="h-4 w-4 text-text-muted" />}
          </For>
        </div>
      </Show>
    </button>
  )
}
