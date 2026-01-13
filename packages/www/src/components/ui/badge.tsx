import { splitProps } from "solid-js";
import type { ComponentProps } from "solid-js";

type BadgeVariant = "default" | "success" | "warning";

type BadgeProps = ComponentProps<"span"> & { variant?: BadgeVariant };

const VARIANTS: Record<BadgeVariant, string> = {
  default: "bg-blue-500/20 text-blue-400",
  success: "bg-emerald-500/20 text-emerald-400",
  warning: "bg-amber-500/20 text-amber-400",
};

const BASE =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none";

export function Badge(props: BadgeProps) {
  const [local, rest] = splitProps(props, ["class", "variant", "children"]);
  const cls = `${BASE} ${VARIANTS[local.variant ?? "default"]}${local.class ? ` ${local.class}` : ""}`;
  return (
    <span {...rest} class={cls}>
      {local.children}
    </span>
  );
}
