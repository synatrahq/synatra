import { Show, type JSX } from "solid-js"
import { Dynamic } from "solid-js/web"
import { getIconComponent, ICON_COLORS } from "./icon-picker"

type IconComponent = (
  props: { size?: number; weight?: string; style?: JSX.CSSProperties },
  ref?: unknown,
) => JSX.Element

type EntityIconProps = {
  icon: string | null
  iconColor: string | null
  size?: number
  iconScale?: number
  rounded?: "sm" | "md" | "lg" | "full"
  fallback?: IconComponent
}

export function EntityIcon(props: EntityIconProps) {
  const size = () => props.size ?? 24
  const scale = () => props.iconScale ?? 0.6
  const rounded = () => props.rounded ?? "sm"
  const colorValue = () => ICON_COLORS.find((c) => c.id === props.iconColor)?.value ?? ICON_COLORS[0].value
  const icon = () => (props.icon ? getIconComponent(props.icon) : null)

  const renderFallback = (): JSX.Element | undefined => {
    if (!props.fallback) return undefined
    return (
      <Dynamic
        component={props.fallback}
        size={size() * scale()}
        weight="duotone"
        style={{
          get color() {
            return colorValue()
          },
        }}
      />
    )
  }

  return (
    <span
      class="flex shrink-0 items-center justify-center"
      classList={{
        rounded: rounded() === "sm",
        "rounded-md": rounded() === "md",
        "rounded-lg": rounded() === "lg",
        "rounded-full": rounded() === "full",
      }}
      style={{
        width: `${size()}px`,
        height: `${size()}px`,
        "background-color": `color-mix(in srgb, ${colorValue()} 15%, transparent)`,
      }}
    >
      <Show when={icon()} fallback={renderFallback()}>
        <Dynamic
          component={icon()}
          size={size() * scale()}
          weight="duotone"
          style={{
            get color() {
              return colorValue()
            },
          }}
        />
      </Show>
    </span>
  )
}
