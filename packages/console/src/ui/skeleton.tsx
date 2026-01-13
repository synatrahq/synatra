import { splitProps } from "solid-js"
import type { ComponentProps } from "solid-js"

interface SkeletonProps extends ComponentProps<"div"> {
  width?: string
  height?: string
}

export function Skeleton(props: SkeletonProps) {
  const [local, rest] = splitProps(props, ["class", "style", "width", "height"])
  const base = "skeleton"
  const merged = local.class ? `${base} ${local.class}` : base

  const style = () => ({
    ...(typeof local.style === "object" ? local.style : {}),
    width: local.width,
    height: local.height,
  })

  return <div {...rest} class={merged} style={style()} />
}

export function SkeletonText(props: ComponentProps<"div"> & { lines?: number }) {
  const [local, rest] = splitProps(props, ["class", "lines"])
  const lines = local.lines ?? 3
  const base = "space-y-2"
  const merged = local.class ? `${base} ${local.class}` : base

  return (
    <div {...rest} class={merged}>
      {Array.from({ length: lines }).map((_, i) => (
        <div class="skeleton h-3 rounded" style={{ width: i === lines - 1 ? "60%" : "100%" }} />
      ))}
    </div>
  )
}

export function SkeletonAvatar(props: ComponentProps<"div"> & { size?: "sm" | "default" | "lg" }) {
  const [local, rest] = splitProps(props, ["class", "size"])
  const size = local.size ?? "default"
  const sizeClass = size === "sm" ? "h-6 w-6" : size === "lg" ? "h-10 w-10" : "h-8 w-8"
  const base = `skeleton rounded-md ${sizeClass}`
  const merged = local.class ? `${base} ${local.class}` : base

  return <div {...rest} class={merged} />
}

export function SkeletonCard(props: ComponentProps<"div">) {
  const [local, rest] = splitProps(props, ["class"])
  const base = "rounded-lg border border-border bg-surface-elevated p-4 space-y-3"
  const merged = local.class ? `${base} ${local.class}` : base

  return (
    <div {...rest} class={merged}>
      <div class="flex items-center gap-3">
        <SkeletonAvatar />
        <div class="flex-1 space-y-2">
          <Skeleton height="12px" width="40%" />
          <Skeleton height="10px" width="60%" />
        </div>
      </div>
      <SkeletonText lines={2} />
    </div>
  )
}
