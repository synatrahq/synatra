import { useNavigate } from "@solidjs/router"
import { Button } from "../ui"
import { LockKey, ArrowRight, Sparkle } from "phosphor-solid-js"

type UpgradePromptProps = {
  message: string
  feature: string
  inline?: boolean
}

export function UpgradePrompt(props: UpgradePromptProps) {
  const navigate = useNavigate()

  return (
    <div
      class="flex flex-col gap-2.5 rounded-md border border-warning bg-warning-soft p-3"
      classList={{ "flex-row items-center justify-between gap-3": props.inline }}
    >
      <div class="flex items-start gap-2.5">
        <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-warning-soft">
          <LockKey class="h-3.5 w-3.5 text-warning" weight="duotone" />
        </div>
        <div class="flex flex-col gap-1">
          <p class="text-xs font-semibold text-warning">{props.feature}</p>
          <p class="text-xs leading-snug text-text-muted">{props.message}</p>
        </div>
      </div>
      <Button
        variant="default"
        size="sm"
        onClick={() => navigate("/settings/billing")}
        class="shrink-0 bg-warning hover:bg-warning-hover"
      >
        <Sparkle class="h-3.5 w-3.5" weight="fill" />
        Upgrade Plan
        <ArrowRight class="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
