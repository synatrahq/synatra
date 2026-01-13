import { createSignal, onMount, onCleanup, Show } from "solid-js"
import { Portal } from "solid-js/web"
import { CaretDown } from "phosphor-solid-js"
import { Badge, Button, Label, Textarea, Spinner } from "../../../ui"

type BumpType = "major" | "minor" | "patch"

type Props = {
  currentVersion: string | null
  disabled?: boolean
  onDeploy: (data: { bump: BumpType; description: string }) => Promise<void>
}

function bumpVersion(current: string | null, bump: BumpType): string {
  if (!current) return bump === "major" ? "1.0.0" : bump === "minor" ? "0.1.0" : "0.0.1"
  const parts = current.split(".").map(Number)
  const [major, minor, patch] = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
  if (bump === "major") return `${major + 1}.0.0`
  if (bump === "minor") return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

export function DeployDropdown(props: Props) {
  const [open, setOpen] = createSignal(false)
  const [position, setPosition] = createSignal({ top: 0, right: 0 })
  const [bumpType, setBumpType] = createSignal<BumpType>("patch")
  const [description, setDescription] = createSignal("")
  const [deploying, setDeploying] = createSignal(false)
  let triggerRef: HTMLButtonElement | undefined
  let menuRef: HTMLDivElement | undefined

  const handleTriggerClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (props.disabled) return
    if (triggerRef) {
      const rect = triggerRef.getBoundingClientRect()
      setPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
    if (!open()) {
      setBumpType("patch")
      setDescription("")
    }
    setOpen(!open())
  }

  const handleClickOutside = (e: MouseEvent) => {
    if (
      open() &&
      menuRef &&
      !menuRef.contains(e.target as Node) &&
      triggerRef &&
      !triggerRef.contains(e.target as Node)
    ) {
      setOpen(false)
    }
  }

  onMount(() => document.addEventListener("click", handleClickOutside))
  onCleanup(() => document.removeEventListener("click", handleClickOutside))

  const handleDeploy = async () => {
    setDeploying(true)
    try {
      await props.onDeploy({ bump: bumpType(), description: description() })
      setOpen(false)
      setDescription("")
    } finally {
      setDeploying(false)
    }
  }

  return (
    <>
      <Button ref={triggerRef} onClick={handleTriggerClick} disabled={props.disabled}>
        Deploy
        <CaretDown class="h-3 w-3" weight="bold" />
      </Button>

      <Show when={open()}>
        <Portal>
          <div
            ref={menuRef}
            class="fixed z-50 w-[280px] rounded-md border border-border bg-surface-floating shadow-elevated"
            style={{ top: `${position().top}px`, right: `${position().right}px` }}
          >
            <div class="flex flex-col gap-3 p-3">
              <div class="flex flex-col gap-1">
                <div class="flex items-center gap-2">
                  <Label>Version</Label>
                  <Badge>{bumpVersion(props.currentVersion, bumpType())}</Badge>
                </div>
                <div class="flex rounded bg-surface-muted p-px">
                  <button
                    type="button"
                    class="h-6 flex-1 rounded-sm px-2 text-xs transition-all"
                    classList={{
                      "bg-surface-elevated text-text shadow-sm": bumpType() === "major",
                      "text-text-muted hover:text-text": bumpType() !== "major",
                    }}
                    onClick={() => setBumpType("major")}
                  >
                    Major
                  </button>
                  <button
                    type="button"
                    class="h-6 flex-1 rounded-sm px-2 text-xs transition-all"
                    classList={{
                      "bg-surface-elevated text-text shadow-sm": bumpType() === "minor",
                      "text-text-muted hover:text-text": bumpType() !== "minor",
                    }}
                    onClick={() => setBumpType("minor")}
                  >
                    Minor
                  </button>
                  <button
                    type="button"
                    class="h-6 flex-1 rounded-sm px-2 text-xs transition-all"
                    classList={{
                      "bg-surface-elevated text-text shadow-sm": bumpType() === "patch",
                      "text-text-muted hover:text-text": bumpType() !== "patch",
                    }}
                    onClick={() => setBumpType("patch")}
                  >
                    Patch
                  </button>
                </div>
              </div>

              <div class="flex flex-col gap-1">
                <Label>Description of changes</Label>
                <Textarea
                  rows={3}
                  placeholder="Optional"
                  value={description()}
                  onInput={(e) => setDescription(e.currentTarget.value)}
                />
              </div>

              <div class="flex justify-end">
                <Button onClick={handleDeploy} disabled={deploying()}>
                  <Show when={deploying()}>
                    <Spinner size="xs" class="mr-1" />
                  </Show>
                  {deploying() ? "Deploying..." : "Deploy"}
                </Button>
              </div>
            </div>
          </div>
        </Portal>
      </Show>
    </>
  )
}
