import { For, Show } from "solid-js"
import { A, useParams } from "@solidjs/router"
import { ListChecks, DotsThree, Robot } from "phosphor-solid-js"
import { DropdownMenu, IconButton, Skeleton, type DropdownMenuItem } from "../../ui"
import { EntityIcon } from "../../components"
import type { Recipes, Agents } from "../../app/api"

type RecipeListItem = Recipes["items"][number] & {
  agent?: Agents[number]
}

type RecipeListProps = {
  recipes: RecipeListItem[]
  agents: Agents
  selectedId?: string | null
  loading?: boolean
  onDelete?: (recipe: RecipeListItem) => void
}

function formatRelativeTime(date: string) {
  const now = Date.now()
  const then = new Date(date).getTime()
  const diff = now - then
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function RecipeItemComponent(props: { recipe: RecipeListItem; isSelected: boolean; onDelete?: () => void }) {
  const params = useParams<{ channelSlug?: string }>()

  const menuItems = (): DropdownMenuItem[] =>
    props.onDelete ? [{ type: "item", label: "Delete", variant: "danger", onClick: props.onDelete }] : []

  const href = () => {
    const base = params.channelSlug ? `/inbox/${params.channelSlug}` : "/inbox"
    return `${base}?view=recipes&recipe=${props.recipe.id}`
  }

  return (
    <A
      href={href()}
      class="group flex cursor-pointer items-start gap-2.5 rounded-md mx-1 px-2.5 py-2 transition-colors"
      classList={{
        "bg-surface-muted": props.isSelected,
        "hover:bg-surface-muted": !props.isSelected,
      }}
    >
      <div class="relative pt-0.5">
        <EntityIcon
          icon={props.recipe.agent?.icon ?? null}
          iconColor={props.recipe.agent?.iconColor ?? null}
          size={24}
          rounded="md"
          fallback={Robot}
        />
        <div class="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-surface-elevated shadow-sm">
          <ListChecks class="h-2.5 w-2.5 text-text-muted" weight="bold" />
        </div>
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="truncate text-[13px] font-medium leading-5 text-text">{props.recipe.name}</span>
          </div>
          <div class="shrink-0">
            <span class="text-2xs text-text-muted group-hover:hidden">
              {formatRelativeTime(props.recipe.createdAt)}
            </span>
            <Show when={menuItems().length > 0}>
              <div class="hidden group-hover:block">
                <DropdownMenu
                  items={menuItems()}
                  trigger={
                    <IconButton variant="ghost" size="xs" onClick={(e) => e.preventDefault()}>
                      <DotsThree class="h-3.5 w-3.5" />
                    </IconButton>
                  }
                />
              </div>
            </Show>
          </div>
        </div>

        <p class="mt-0.5 truncate text-xs text-text-muted">
          {props.recipe.agent?.name ?? "Agent"} · {props.recipe.stepCount ?? 0} steps
        </p>
      </div>
    </A>
  )
}

function RecipeListSkeleton() {
  return (
    <div class="flex flex-col gap-1 p-2">
      <For each={[1, 2, 3, 4, 5]}>
        {() => (
          <div class="flex items-start gap-3 rounded-lg px-3 py-2.5">
            <Skeleton class="h-8 w-8 rounded-md" />
            <div class="flex-1 space-y-2">
              <div class="flex items-center justify-between">
                <Skeleton class="h-3.5 w-24" />
                <Skeleton class="h-3 w-8" />
              </div>
              <Skeleton class="h-3 w-32" />
            </div>
          </div>
        )}
      </For>
    </div>
  )
}

function EmptyState() {
  return (
    <div class="flex h-48 flex-col items-center justify-center gap-3 text-text-muted">
      <div class="flex h-14 w-14 items-center justify-center rounded-full bg-surface-muted">
        <ListChecks class="h-6 w-6" weight="duotone" />
      </div>
      <div class="text-center">
        <p class="text-[13px] font-medium">No recipes</p>
        <p class="mt-0.5 text-xs">Create one from a completed run</p>
      </div>
    </div>
  )
}

export function RecipeList(props: RecipeListProps) {
  const recipesWithAgents = () =>
    props.recipes.map((recipe) => ({
      ...recipe,
      agent: props.agents.find((a) => a.id === recipe.agentId),
    }))

  return (
    <div class="flex flex-1 flex-col overflow-y-auto scrollbar-thin">
      <Show when={props.loading}>
        <RecipeListSkeleton />
      </Show>
      <Show when={!props.loading && recipesWithAgents().length === 0}>
        <EmptyState />
      </Show>
      <Show when={!props.loading && recipesWithAgents().length > 0}>
        <div class="flex flex-col py-1">
          <For each={recipesWithAgents()}>
            {(recipe) => (
              <RecipeItemComponent
                recipe={recipe}
                isSelected={recipe.id === props.selectedId}
                onDelete={props.onDelete ? () => props.onDelete?.(recipe) : undefined}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
