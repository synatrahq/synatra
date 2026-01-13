import { Dynamic } from "solid-js/web"
import { Robot } from "phosphor-solid-js"
import { ICON_COLORS, getIconComponent } from "../icon-picker"

type AgentIconProps = {
  icon: string | null
  iconColor: string | null
  size?: number
  rounded?: "full" | "md"
}

export function AgentIcon(props: AgentIconProps) {
  const size = () => props.size ?? 20
  const rounded = () => (props.rounded === "md" ? "rounded-md" : "rounded-full")
  const colorValue = () => ICON_COLORS.find((c) => c.id === props.iconColor)?.value ?? ICON_COLORS[0].value
  const icon = () => (props.icon ? getIconComponent(props.icon) : null)

  return (
    <span
      class={`flex shrink-0 items-center justify-center ${rounded()}`}
      style={{
        width: `${size()}px`,
        height: `${size()}px`,
        "background-color": `color-mix(in srgb, ${colorValue()} 15%, transparent)`,
      }}
    >
      {icon() ? (
        <Dynamic component={icon()!} size={size() * 0.55} weight="duotone" style={{ color: colorValue() }} />
      ) : (
        <Robot size={size() * 0.55} weight="duotone" style={{ color: colorValue() }} />
      )}
    </span>
  )
}

export function getAgentColor(iconColor: string | null): string {
  return ICON_COLORS.find((c) => c.id === iconColor)?.value ?? ICON_COLORS[0].value
}
