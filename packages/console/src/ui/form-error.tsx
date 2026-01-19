import { Show } from "solid-js"
import type { JSX } from "solid-js"
import { WarningCircle } from "phosphor-solid-js"

type FormErrorProps = {
  message?: string | null
  class?: string
  children?: JSX.Element
}

export function FormError(props: FormErrorProps) {
  const content = () => props.children ?? props.message

  return (
    <Show when={content()}>
      <div class={`flex items-start gap-2 rounded-lg bg-danger-soft p-2 ${props.class ?? ""}`}>
        <WarningCircle size={14} weight="fill" class="mt-0.5 shrink-0 text-danger" />
        <p class="text-xs text-danger">{content()}</p>
      </div>
    </Show>
  )
}
