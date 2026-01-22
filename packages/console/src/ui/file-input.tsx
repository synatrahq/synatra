import { createSignal, Show, splitProps } from "solid-js"
import { X } from "phosphor-solid-js"

export type FileInputProps = {
  value: string | null
  filename: string | null
  accept?: string
  placeholder?: string
  onChange?: (content: string | null, filename: string | null) => void
  onValidate?: (content: string) => string | null
  hasError?: boolean
  disabled?: boolean
  class?: string
}

export function FileInput(props: FileInputProps) {
  const [local] = splitProps(props, [
    "value",
    "filename",
    "accept",
    "placeholder",
    "onChange",
    "onValidate",
    "hasError",
    "disabled",
    "class",
  ])

  const [error, setError] = createSignal<string | undefined>()
  const [localFilename, setLocalFilename] = createSignal<string | null>(local.filename)
  let inputRef: HTMLInputElement | undefined

  const displayFilename = () => {
    if (localFilename()) return localFilename()
    if (local.filename) return local.filename
    return null
  }

  const hasFile = () => local.value !== null && local.value !== ""

  const handleClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (local.disabled) return
    inputRef?.click()
  }

  const handleFileChange = (e: Event) => {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    setError(undefined)

    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      if (local.onValidate) {
        const validationError = local.onValidate(content)
        if (validationError) {
          setError(validationError)
          input.value = ""
          return
        }
      }
      setLocalFilename(file.name)
      local.onChange?.(content, file.name)
      input.value = ""
    }
    reader.onerror = () => {
      setError("Failed to read file")
      input.value = ""
    }
    reader.readAsText(file)
  }

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation()
    setError(undefined)
    setLocalFilename(null)
    local.onChange?.("", null)
  }

  const borderClass = () => (local.hasError || error() ? "border-danger" : "border-border")

  return (
    <div class={`space-y-1 ${local.class ?? ""}`}>
      <input
        ref={inputRef}
        type="file"
        accept={local.accept ?? ".pem,.crt,.key,.cert"}
        onChange={handleFileChange}
        class="hidden"
        disabled={local.disabled}
      />
      <div
        class={`flex h-7 cursor-pointer items-center overflow-hidden rounded border bg-surface-elevated text-xs transition-colors ${borderClass()}`}
        classList={{ "opacity-40 cursor-not-allowed": local.disabled }}
        onClick={handleClick}
      >
        <span class="shrink-0 px-2.5 text-text">Select file</span>
        <span class="flex h-full min-w-0 flex-1 items-center gap-1.5 border-l border-border px-2.5">
          <Show
            when={displayFilename()}
            fallback={<span class="truncate text-text-muted">{local.placeholder ?? "No file selected"}</span>}
          >
            <span class="truncate text-text">{displayFilename()}</span>
          </Show>
        </span>
        <Show when={hasFile()}>
          <button
            type="button"
            onClick={handleDelete}
            disabled={local.disabled}
            class="flex h-full w-7 shrink-0 items-center justify-center border-l border-border text-text-muted transition-colors hover:bg-surface-muted hover:text-text disabled:opacity-40"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </Show>
      </div>
      <Show when={error()}>
        <p class="text-2xs text-danger">{error()}</p>
      </Show>
    </div>
  )
}
