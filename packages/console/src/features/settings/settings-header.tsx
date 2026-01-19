import type { JSX } from "solid-js"

type SettingsHeaderProps = {
  title: string
  titleExtra?: JSX.Element
  children?: JSX.Element
}

export function SettingsHeader(props: SettingsHeaderProps) {
  return (
    <div class="flex h-10 items-center justify-between px-3">
      <div class="flex items-center gap-2">
        <h1 class="text-xs font-medium text-text">{props.title}</h1>
        {props.titleExtra}
      </div>
      {props.children}
    </div>
  )
}
