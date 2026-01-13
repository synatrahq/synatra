import { splitProps } from "solid-js";
import type { ComponentProps } from "solid-js";

type SpinnerSize = "xs" | "sm";

type SpinnerProps = ComponentProps<"div"> & { size?: SpinnerSize };

const SIZES: Record<SpinnerSize, string> = {
  xs: "h-3 w-3 border",
  sm: "h-4 w-4 border-[1.5px]",
};

const BASE = "animate-spin rounded-full border-gray-400 border-t-transparent";

export function Spinner(props: SpinnerProps) {
  const [local, rest] = splitProps(props, ["class", "size"]);
  const cls = `${BASE} ${SIZES[local.size ?? "sm"]}${local.class ? ` ${local.class}` : ""}`;
  return <div {...rest} class={cls} role="status" aria-label="Loading" />;
}
