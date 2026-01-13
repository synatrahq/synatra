import { CheckCircle, CircleNotch, XCircle, Prohibit, UserCircle } from "phosphor-solid-js"
import type { ToolStatus } from "./types"

type ToolStatusIconProps = {
  status: ToolStatus
  waitingApproval?: boolean
  size?: "sm" | "md"
}

export function ToolStatusIcon(props: ToolStatusIconProps) {
  const sizeClass = () => (props.size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5")

  if (props.status === "running" && props.waitingApproval) {
    return <UserCircle class={`${sizeClass()} shrink-0 text-warning`} weight="fill" />
  }

  switch (props.status) {
    case "running":
      return <CircleNotch class={`${sizeClass()} shrink-0 animate-spin`} />
    case "success":
      return <CheckCircle class={`${sizeClass()} shrink-0 text-success`} weight="fill" />
    case "error":
      return <XCircle class={`${sizeClass()} shrink-0 text-danger`} weight="fill" />
    case "rejected":
      return <Prohibit class={`${sizeClass()} shrink-0 text-text-muted`} weight="fill" />
  }
}
