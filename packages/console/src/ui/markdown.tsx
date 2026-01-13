import { createMemo, splitProps } from "solid-js"
import type { ComponentProps } from "solid-js"
import { marked } from "marked"
import DOMPurify from "dompurify"

marked.use({ gfm: true, breaks: true })

interface MarkdownProps extends Omit<ComponentProps<"div">, "children"> {
  children: string
}

export function Markdown(props: MarkdownProps) {
  const [local, rest] = splitProps(props, ["class", "children"])

  const html = createMemo(() => {
    if (!local.children) return ""
    const raw = marked.parse(local.children, { async: false }) as string
    return DOMPurify.sanitize(raw)
  })

  const base = "prose prose-sm max-w-none"
  const merged = local.class ? `${base} ${local.class}` : base

  return <div {...rest} class={merged} innerHTML={html()} />
}
