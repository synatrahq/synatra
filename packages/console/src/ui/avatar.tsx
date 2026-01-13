import { splitProps, Show, createSignal } from "solid-js"
import type { ComponentProps } from "solid-js"

type AvatarSize = "xs" | "sm" | "default" | "lg" | "xl"
type AvatarVariant = "default" | "accent"

interface AvatarProps extends ComponentProps<"div"> {
  src?: string
  alt?: string
  fallback?: string
  size?: AvatarSize
  variant?: AvatarVariant
}

const sizeStyles: Record<AvatarSize, string> = {
  xs: "h-5 w-5 text-[9px]",
  sm: "h-6 w-6 text-[10px]",
  default: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
  xl: "h-12 w-12 text-base",
}

const variantStyles: Record<AvatarVariant, string> = {
  default: "bg-surface-muted text-text-muted",
  accent: "bg-accent-soft text-accent",
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function Avatar(props: AvatarProps) {
  const [local, rest] = splitProps(props, ["class", "src", "alt", "fallback", "size", "variant", "children"])
  const size = local.size ?? "default"
  const variant = local.variant ?? "default"
  const [imageError, setImageError] = createSignal(false)

  const showImage = () => local.src && !imageError()
  const fallbackText = () => {
    if (local.fallback) return getInitials(local.fallback)
    if (local.alt) return getInitials(local.alt)
    return "?"
  }

  const base = "relative flex shrink-0 overflow-hidden rounded-md"
  const sizeClass = sizeStyles[size]
  const merged = local.class ? `${base} ${sizeClass} ${local.class}` : `${base} ${sizeClass}`

  return (
    <div {...rest} class={merged}>
      <Show
        when={showImage()}
        fallback={
          <div class={`flex h-full w-full items-center justify-center font-medium ${variantStyles[variant]}`}>
            {fallbackText()}
          </div>
        }
      >
        <img
          src={local.src}
          alt={local.alt || ""}
          class="aspect-square h-full w-full object-cover"
          onError={() => setImageError(true)}
        />
      </Show>
      {local.children}
    </div>
  )
}

interface AvatarGroupProps extends ComponentProps<"div"> {
  max?: number
}

export function AvatarGroup(props: AvatarGroupProps) {
  const [local, rest] = splitProps(props, ["class", "max", "children"])
  const base = "flex -space-x-2"
  const merged = local.class ? `${base} ${local.class}` : base

  return (
    <div {...rest} class={merged}>
      {local.children}
    </div>
  )
}
