import { createSignal, createEffect, Show, onCleanup } from "solid-js"
import { Modal, ModalContainer, ModalHeader, ModalBody, ModalFooter, Button, Input, Textarea, Spinner } from "../../ui"
import { IconPicker, getIconComponent, ICON_COLORS, type IconColor } from "../../components"

type AgentEditModalProps = {
  open: boolean
  agent: {
    id: string
    name: string
    description: string | null
    icon?: string
    iconColor?: string
  } | null
  onClose: () => void
  onSave: (data: { id: string; name: string; description: string; icon: string; iconColor: string }) => Promise<void>
  saving?: boolean
}

const MAX_DESCRIPTION_LENGTH = 255

export function AgentEditModal(props: AgentEditModalProps) {
  const [name, setName] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [error, setError] = createSignal<string | null>(null)

  const [selectedIcon, setSelectedIcon] = createSignal("CircleDashed")
  const [selectedColor, setSelectedColor] = createSignal<IconColor>("blue")
  const [showIconPicker, setShowIconPicker] = createSignal(false)
  let iconPickerRef: HTMLDivElement | undefined

  const handleClickOutside = (e: MouseEvent) => {
    if (showIconPicker() && iconPickerRef && !iconPickerRef.contains(e.target as Node)) {
      setShowIconPicker(false)
    }
  }

  if (typeof document !== "undefined") {
    document.addEventListener("click", handleClickOutside)
    onCleanup(() => {
      document.removeEventListener("click", handleClickOutside)
    })
  }

  createEffect(() => {
    if (!props.agent) return
    setName(props.agent.name)
    setDescription(props.agent.description ?? "")
    setSelectedIcon(props.agent.icon ?? "CircleDashed")
    setSelectedColor((props.agent.iconColor as IconColor) ?? "blue")
    setError(null)
    setShowIconPicker(false)
  })

  const handleDescriptionChange = (value: string) => {
    if (value.length <= MAX_DESCRIPTION_LENGTH) {
      setDescription(value)
    }
  }

  const handleSave = async () => {
    if (!props.agent) return

    if (!name().trim()) {
      setError("Name is required")
      return
    }

    await props.onSave({
      id: props.agent.id,
      name: name().trim(),
      description: description().trim(),
      icon: selectedIcon(),
      iconColor: selectedColor(),
    })
  }

  const selectedColorValue = () => ICON_COLORS.find((c) => c.id === selectedColor())?.value ?? ICON_COLORS[0].value

  const selectedBg = () => `color-mix(in srgb, ${selectedColorValue()} 15%, transparent)`

  const renderSelectedIcon = () => {
    const IconComponent = getIconComponent(selectedIcon())
    if (!IconComponent) return null
    const color = selectedColorValue()
    return <IconComponent size={14} weight="duotone" color={color} fill={color} style={{ color }} />
  }

  return (
    <Modal open={props.open} onBackdropClick={props.onClose} onEscape={props.onClose}>
      <ModalContainer>
        <ModalHeader title="Edit agent" onClose={props.onClose} />

        <ModalBody>
          <>
            <div class="flex items-center gap-2">
              <label class="w-16 shrink-0 text-xs text-text-muted">Name</label>
              <div class="flex flex-1 items-center gap-1.5">
                <div ref={iconPickerRef} class="relative">
                  <button
                    type="button"
                    class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent transition-colors hover:border-border-strong"
                    classList={{ "border-accent": showIconPicker() }}
                    style={{
                      "background-color": selectedBg(),
                      color: selectedColorValue(),
                      fill: selectedColorValue(),
                    }}
                    title="Choose icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowIconPicker(!showIconPicker())
                    }}
                  >
                    {renderSelectedIcon()}
                  </button>

                  <Show when={showIconPicker()}>
                    <div class="absolute left-0 top-full z-50 mt-1 rounded-lg border border-border bg-surface p-3 shadow-elevated">
                      <IconPicker
                        selectedIcon={selectedIcon()}
                        selectedColor={selectedColor()}
                        onIconChange={setSelectedIcon}
                        onColorChange={setSelectedColor}
                      />
                    </div>
                  </Show>
                </div>
                <Input
                  type="text"
                  value={name()}
                  onInput={(e) => setName(e.currentTarget.value)}
                  placeholder="Refund Processor"
                  class="h-7 flex-1 text-xs"
                />
              </div>
            </div>

            <div class="flex items-start gap-2">
              <label class="w-16 shrink-0 pt-1.5 text-xs text-text-muted">Description</label>
              <div class="flex flex-1 flex-col gap-0.5">
                <Textarea
                  value={description()}
                  onInput={(e) => handleDescriptionChange(e.currentTarget.value)}
                  placeholder="Handles customer refund requests automatically"
                  rows={2}
                />
                <span class="self-end text-[10px] text-text-muted">
                  {description().length}/{MAX_DESCRIPTION_LENGTH}
                </span>
              </div>
            </div>

            <Show when={error()}>
              <div class="rounded-md border border-danger bg-danger-soft px-2.5 py-1.5 text-2xs text-danger">
                {error()}
              </div>
            </Show>
          </>
        </ModalBody>

        <ModalFooter>
          <>
            <Button variant="ghost" size="sm" onClick={props.onClose}>
              Cancel
            </Button>
            <Button variant="default" size="sm" onClick={handleSave} disabled={props.saving || !name().trim()}>
              {props.saving && <Spinner size="xs" class="border-white border-t-transparent" />}
              {props.saving ? "Saving..." : "Save"}
            </Button>
          </>
        </ModalFooter>
      </ModalContainer>
    </Modal>
  )
}
