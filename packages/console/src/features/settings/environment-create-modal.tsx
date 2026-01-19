import { createSignal, createEffect, Show, For, onCleanup } from "solid-js"
import { EnvironmentColorPalette } from "@synatra/core/types"
import {
  Modal,
  ModalContainer,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  FormField,
  Spinner,
  FormError,
} from "../../ui"

type EnvironmentCreateModalProps = {
  open: boolean
  onClose: () => void
  onSave: (data: { name: string; slug?: string; color: string }) => Promise<void>
  saving?: boolean
}

function normalizeColor(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  const prefixed = trimmed.startsWith("#") ? trimmed : `#${trimmed}`
  if (!/^#[0-9A-Fa-f]{6}$/.test(prefixed)) return ""
  return `#${prefixed.slice(1).toUpperCase()}`
}

const defaultColor = EnvironmentColorPalette[3].toLowerCase()

export function EnvironmentCreateModal(props: EnvironmentCreateModalProps) {
  const [name, setName] = createSignal("")
  const [slug, setSlug] = createSignal("")
  const [color, setColor] = createSignal(defaultColor)
  const [colorPickerOpen, setColorPickerOpen] = createSignal(false)
  const [error, setError] = createSignal("")

  createEffect(() => {
    if (props.open) {
      setName("")
      setSlug("")
      setColor(defaultColor)
      setColorPickerOpen(false)
      setError("")
    }
  })

  createEffect(() => {
    if (!colorPickerOpen()) return
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (target.closest("[data-color-picker]")) return
      if (target.closest("[data-color-button]")) return
      setColorPickerOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    onCleanup(() => document.removeEventListener("mousedown", handleClickOutside))
  })

  const handleSave = async () => {
    const trimmedName = name().trim()
    const trimmedSlug = slug().trim()
    const trimmedColor = color().trim()
    const normalizedColor = normalizeColor(trimmedColor || defaultColor)

    if (!trimmedName) {
      setError("Name is required")
      return
    }
    if (!normalizedColor) {
      setError("Color must be a hex code like #3366FF")
      return
    }

    try {
      await props.onSave({
        name: trimmedName,
        slug: trimmedSlug || undefined,
        color: normalizedColor,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create environment")
    }
  }

  return (
    <Modal open={props.open} onBackdropClick={props.onClose} onEscape={props.onClose}>
      <ModalContainer size="sm">
        <ModalHeader title="New environment" onClose={props.onClose} />
        <ModalBody>
          <FormField label="Name" horizontal labelWidth="4.5rem">
            <Input value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder="Production" />
          </FormField>

          <FormField label="Slug" horizontal labelWidth="4.5rem" description="Leave blank to generate from name">
            <Input
              value={slug()}
              onInput={(e) => setSlug(e.currentTarget.value)}
              placeholder="production"
              class="font-code"
            />
          </FormField>

          <FormField label="Color" horizontal labelWidth="4.5rem">
            <div class="relative">
              <div class="flex h-7 items-center gap-2 rounded border border-border bg-surface-elevated px-2">
                <button
                  type="button"
                  class="relative h-4 w-4 shrink-0 rounded transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                  style={{ background: color() }}
                  onClick={() => setColorPickerOpen((prev) => !prev)}
                  data-color-button
                >
                  <span class="absolute inset-0 rounded ring-1 ring-inset ring-black/10" />
                </button>
                <input
                  type="text"
                  value={color()}
                  onInput={(e) => setColor(e.currentTarget.value.toLowerCase())}
                  placeholder="#3366FF"
                  autocomplete="off"
                  class="flex-1 border-none bg-transparent font-code text-xs leading-tight text-text outline-none"
                />
              </div>
              <Show when={colorPickerOpen()}>
                <div
                  class="absolute left-0 top-full z-50 mt-1 rounded border border-border bg-surface-floating p-1.5 shadow-lg"
                  data-color-picker
                >
                  <div class="grid grid-cols-8 gap-1">
                    <For each={EnvironmentColorPalette}>
                      {(presetColor) => (
                        <button
                          type="button"
                          class="relative h-6 w-6 rounded transition-all duration-100 hover:scale-110"
                          classList={{
                            "ring-2 ring-accent ring-offset-1 ring-offset-surface-elevated":
                              color() === presetColor.toLowerCase(),
                          }}
                          style={{ background: presetColor }}
                          onClick={() => {
                            setColor(presetColor.toLowerCase())
                            setColorPickerOpen(false)
                          }}
                        >
                          <span class="absolute inset-0 rounded ring-1 ring-inset ring-black/5" />
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
            </div>
          </FormField>

          <FormError message={error()} />
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" size="sm" onClick={props.onClose} disabled={props.saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={props.saving || !name().trim()}>
            {props.saving && <Spinner size="xs" class="border-white border-t-transparent" />}
            {props.saving ? "Creating..." : "Create"}
          </Button>
        </ModalFooter>
      </ModalContainer>
    </Modal>
  )
}
