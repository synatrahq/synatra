import { onMount, onCleanup, createEffect } from "solid-js"
import { EditorView, minimalSetup } from "codemirror"
import { EditorState, Compartment, RangeSet, Prec } from "@codemirror/state"
import { javascript } from "@codemirror/lang-javascript"
import { json } from "@codemirror/lang-json"
import { yaml } from "@codemirror/lang-yaml"
import { markdown } from "@codemirror/lang-markdown"
import { placeholder as placeholderExt, Decoration } from "@codemirror/view"
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language"
import { tags } from "@lezer/highlight"
import { vim } from "@replit/codemirror-vim"
import { vimMode } from "../app"

type Language = "javascript" | "json" | "yaml" | "markdown" | "text"

type Highlight = {
  from: number
  to: number
  status: "ok" | "error"
  message?: string
}

interface CodeEditorProps {
  value: string
  onChange?: (value: string) => void
  language?: Language
  placeholder?: string
  class?: string
  readonly?: boolean
  minLines?: number
  indent?: boolean
  bordered?: boolean
  highlights?: Highlight[]
  focusLine?: number
}

const LINE_HEIGHT = 18
const PADDING = 16

const createTheme = (minLines: number, indent: boolean) =>
  EditorView.theme({
    "&": {
      fontSize: "12px",
      fontFamily: "var(--font-code)",
      fontWeight: "500",
      backgroundColor: "transparent",
      height: "100%",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      fontFamily: "var(--font-code)",
      fontWeight: "500",
      lineHeight: "1.5",
      overflow: "auto !important",
    },
    ".cm-content": {
      padding: "8px 0",
      caretColor: "var(--color-text)",
      minHeight: `${LINE_HEIGHT * minLines + PADDING}px`,
    },
    ".cm-line": {
      padding: indent ? "0 12px 0 24px" : "0 12px",
    },
    ".cm-placeholder": {
      color: "var(--color-text-muted)",
      opacity: "0.5",
    },
    ".cm-selectionBackground": {
      backgroundColor: "var(--color-accent-soft) !important",
    },
    "&.cm-focused .cm-selectionBackground": {
      backgroundColor: "var(--color-accent-soft) !important",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--syntax-function)",
      borderLeftWidth: "2px",
    },
    ".cm-fat-cursor": {
      position: "absolute",
      background: "var(--syntax-function)",
      border: "none",
      whiteSpace: "pre",
      color: "#ffffff !important",
    },
    "&:not(.cm-focused) .cm-fat-cursor": {
      background: "none",
      outline: "solid 1px var(--syntax-function)",
      color: "transparent !important",
    },
    ".cm-gutters": {
      display: "none",
    },
  })

const highlight = HighlightStyle.define([
  // Keywords
  { tag: tags.keyword, color: "var(--syntax-keyword)" },
  { tag: tags.controlKeyword, color: "var(--syntax-keyword)" },
  { tag: tags.operatorKeyword, color: "var(--syntax-keyword)" },
  { tag: tags.definitionKeyword, color: "var(--syntax-keyword)" },
  { tag: tags.moduleKeyword, color: "var(--syntax-keyword)" },

  // Literals
  { tag: tags.string, color: "var(--syntax-string)" },
  { tag: tags.number, color: "var(--syntax-number)" },
  { tag: tags.bool, color: "var(--syntax-number)" },
  { tag: tags.null, color: "var(--syntax-constant)" },

  // Comments
  { tag: tags.comment, color: "var(--syntax-comment)" },
  { tag: tags.lineComment, color: "var(--syntax-comment)" },
  { tag: tags.blockComment, color: "var(--syntax-comment)" },

  // Properties (object keys like obj.prop or { prop: value })
  { tag: tags.propertyName, color: "var(--syntax-property)" },
  { tag: tags.definition(tags.propertyName), color: "var(--syntax-property)" },

  // Method calls (obj.method())
  { tag: tags.function(tags.propertyName), color: "var(--syntax-function)" },

  // Variables
  { tag: tags.variableName, color: "var(--syntax-variable)" },
  { tag: tags.definition(tags.variableName), color: "var(--syntax-variable)" },

  // Function calls and definitions
  { tag: tags.function(tags.variableName), color: "var(--syntax-function)" },
  { tag: tags.definition(tags.function(tags.variableName)), color: "var(--syntax-function)" },

  // Types & Classes
  { tag: tags.typeName, color: "var(--syntax-type)" },
  { tag: tags.className, color: "var(--syntax-type)" },
  { tag: tags.namespace, color: "var(--syntax-variable)" },

  // Operators & Punctuation
  { tag: tags.operator, color: "var(--syntax-operator)" },
  { tag: tags.punctuation, color: "var(--syntax-punctuation)" },
  { tag: tags.bracket, color: "var(--syntax-punctuation)" },
  { tag: tags.squareBracket, color: "var(--syntax-punctuation)" },
  { tag: tags.paren, color: "var(--syntax-punctuation)" },
  { tag: tags.brace, color: "var(--syntax-punctuation)" },
  { tag: tags.separator, color: "var(--syntax-punctuation)" },

  // Constants (like UPPER_CASE variables)
  { tag: tags.constant(tags.variableName), color: "var(--syntax-constant)" },

  // Markdown
  { tag: tags.heading, color: "var(--syntax-keyword)", fontWeight: "600" },
  { tag: tags.heading1, color: "var(--syntax-keyword)", fontWeight: "700" },
  { tag: tags.heading2, color: "var(--syntax-keyword)", fontWeight: "600" },
  { tag: tags.heading3, color: "var(--syntax-keyword)", fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "var(--syntax-function)", textDecoration: "underline" },
  { tag: tags.url, color: "var(--syntax-string)" },
  { tag: tags.quote, color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: tags.monospace, color: "var(--syntax-string)" },
  { tag: tags.list, color: "var(--syntax-punctuation)" },
])

const languages = {
  javascript: () => javascript({ typescript: true }),
  json: () => json(),
  yaml: () => yaml(),
  markdown: () => markdown(),
  text: () => [],
}

function createHighlightExtension(highlights?: Highlight[]) {
  if (!highlights || highlights.length === 0) {
    return []
  }

  const ranges: { from: number; to: number; value: Decoration }[] = []
  for (const h of highlights) {
    const prefix = h.status === "ok" ? "cm-evaluation-success" : "cm-evaluation-error"
    const attrs = h.message ? { title: h.message } : undefined
    const bgDeco = Decoration.mark({ class: prefix, attributes: attrs })
    const openDeco = Decoration.mark({ class: `${prefix}-open-bracket` })
    const closeDeco = Decoration.mark({ class: `${prefix}-close-bracket` })
    ranges.push({ from: h.from, to: h.to, value: bgDeco })
    ranges.push({ from: h.from, to: h.from + 2, value: openDeco })
    ranges.push({ from: h.to - 2, to: h.to, value: closeDeco })
  }

  const sorted = ranges.sort((a, b) => a.from - b.from)
  return [EditorView.decorations.of(RangeSet.of(sorted.map((r) => r.value.range(r.from, r.to))))]
}

const highlightTheme = EditorView.theme({
  ".cm-evaluation-success-open-bracket, .cm-evaluation-success-close-bracket": {
    color: "var(--color-success)",
    fontWeight: "600",
  },
  ".cm-evaluation-success": {
    backgroundColor: "var(--color-success-soft)",
    borderRadius: "2px",
    mixBlendMode: "multiply",
  },
  ".cm-evaluation-error-open-bracket, .cm-evaluation-error-close-bracket": {
    color: "var(--color-danger)",
    fontWeight: "600",
  },
  ".cm-evaluation-error": {
    backgroundColor: "var(--color-danger-soft)",
    borderRadius: "2px",
    mixBlendMode: "multiply",
  },
})

const vimCursorTheme = Prec.highest(
  EditorView.theme({
    ".cm-fat-cursor": {
      background: "var(--syntax-function) !important",
      color: "#ffffff !important",
    },
    "&:not(.cm-focused) .cm-fat-cursor": {
      background: "none !important",
      outline: "solid 1px var(--syntax-function) !important",
      color: "transparent !important",
    },
  }),
)

export function CodeEditor(props: CodeEditorProps) {
  let container!: HTMLDivElement
  let view: EditorView | undefined
  const lang = new Compartment()
  const readonly = new Compartment()
  const highlightCompartment = new Compartment()
  const vimCompartment = new Compartment()

  onMount(() => {
    const langExt = languages[props.language ?? "javascript"]()
    const extensions = [
      vimCompartment.of(vimMode() ? [vim(), vimCursorTheme] : []),
      minimalSetup,
      lang.of(langExt),
      createTheme(props.minLines ?? 1, props.indent ?? true),
      syntaxHighlighting(highlight),
      readonly.of(EditorState.readOnly.of(props.readonly ?? false)),
      highlightTheme,
      highlightCompartment.of(createHighlightExtension(props.highlights)),
      EditorView.lineWrapping,
    ]

    if (props.placeholder) {
      extensions.push(placeholderExt(props.placeholder))
    }

    if (props.onChange) {
      extensions.push(
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            props.onChange?.(update.state.doc.toString())
          }
        }),
      )
    }

    view = new EditorView({
      state: EditorState.create({
        doc: props.value,
        extensions,
      }),
      parent: container,
    })
  })

  createEffect(() => {
    const val = props.value
    if (view && view.state.doc.toString() !== val) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: val },
      })
    }
  })

  createEffect(() => {
    const langExt = languages[props.language ?? "javascript"]()
    view?.dispatch({ effects: lang.reconfigure(langExt) })
  })

  createEffect(() => {
    view?.dispatch({
      effects: readonly.reconfigure(EditorState.readOnly.of(props.readonly ?? false)),
    })
  })

  createEffect(() => {
    view?.dispatch({
      effects: highlightCompartment.reconfigure(createHighlightExtension(props.highlights)),
    })
  })

  createEffect(() => {
    view?.dispatch({
      effects: vimCompartment.reconfigure(vimMode() ? [vim(), vimCursorTheme] : []),
    })
  })

  createEffect(() => {
    const line = props.focusLine
    if (!view || !line || line < 1) return
    const doc = view.state.doc
    if (line > doc.lines) return
    const lineInfo = doc.line(line)
    view.dispatch({
      selection: { anchor: lineInfo.from },
      scrollIntoView: true,
    })
    view.focus()
  })

  onCleanup(() => view?.destroy())

  const baseClass = "h-full overflow-auto"
  const borderClass = props.bordered
    ? "rounded bg-surface-elevated shadow-[inset_0_0_0_1px_var(--color-border)] focus-within:shadow-[inset_0_0_0_1px_var(--color-accent),0_0_0_1px_var(--color-accent)] transition-shadow duration-100"
    : ""

  return <div ref={container} class={`${baseClass} ${borderClass} ${props.class ?? ""}`} />
}
