import { Show, For, createSignal, createEffect } from "solid-js"
import {
  Modal,
  ModalContainer,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Textarea,
  Badge,
  Spinner,
  Select,
} from "../../ui"
import type { RecipeExtractResult } from "../../app/api"

type RecipeModel = {
  id: string
  name: string
}

type RecipeExtractModalProps = {
  open: boolean
  models: RecipeModel[]
  modelsLoading?: boolean
  extracting?: boolean
  extractResult: RecipeExtractResult | null
  agentId: string
  agentName: string
  onClose: () => void
  onExtract: (modelId: string | null) => void
  onSave: (data: { name: string; description: string }) => void
  saving?: boolean
}

export function RecipeExtractModal(props: RecipeExtractModalProps) {
  const [name, setName] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [selectedModel, setSelectedModel] = createSignal<string | null>(null)

  createEffect(() => {
    if (props.open) {
      setName("")
      setDescription("")
      if (props.models.length > 0 && !selectedModel()) {
        setSelectedModel(props.models[0].id)
      }
    }
  })

  createEffect(() => {
    if (props.models.length > 0 && !selectedModel()) {
      setSelectedModel(props.models[0].id)
    }
  })

  const handleSave = () => {
    if (!name().trim()) return
    props.onSave({ name: name().trim(), description: description().trim() })
  }

  const handleExtract = () => {
    props.onExtract(selectedModel())
  }

  const isInitialState = () => !props.extracting && !props.extractResult

  const canClose = () => !props.extracting

  return (
    <Modal
      open={props.open}
      onBackdropClick={canClose() ? props.onClose : undefined}
      onEscape={canClose() ? props.onClose : undefined}
    >
      <ModalContainer size="md">
        <ModalHeader
          title="Create recipe"
          badge={{ label: "Experimental", variant: "warning" }}
          onClose={canClose() ? props.onClose : undefined}
        />
        <ModalBody>
          <Show when={isInitialState()}>
            <div class="space-y-4">
              <p class="text-xs text-text-muted">Extract a reusable recipe from {props.agentName}'s run</p>

              <div>
                <label class="mb-1.5 block text-xs font-medium text-text">Model for dependency inference</label>
                <Show
                  when={!props.modelsLoading}
                  fallback={
                    <div class="flex items-center gap-2 py-2">
                      <Spinner size="xs" />
                      <span class="text-xs text-text-muted">Loading models...</span>
                    </div>
                  }
                >
                  <Select
                    value={selectedModel() ?? undefined}
                    options={props.models.map((m) => ({ value: m.id, label: m.name }))}
                    onChange={(v) => setSelectedModel(v)}
                    disabled={props.models.length === 0}
                    placeholder="Select model..."
                  />
                  <Show when={props.models.length === 0}>
                    <p class="mt-1.5 text-2xs text-text-muted">
                      No models available. Configure API keys in the Synatra AI resource.
                    </p>
                  </Show>
                </Show>
              </div>

              <p class="text-2xs text-text-muted">
                The model will analyze the tool call sequence to infer data dependencies between steps.
              </p>
            </div>
          </Show>

          <Show when={props.extracting}>
            <div class="flex flex-col items-center justify-center py-8">
              <Spinner />
              <p class="mt-3 text-xs text-text-muted">Extracting recipe from run...</p>
            </div>
          </Show>

          <Show
            when={
              !props.extracting && props.extractResult && "steps" in props.extractResult ? props.extractResult : null
            }
          >
            {(result) => (
              <div class="space-y-4">
                <p class="text-xs text-text-muted">Extract a reusable recipe from {props.agentName}'s run</p>

                <div>
                  <label class="mb-1.5 block text-xs font-medium text-text">Name</label>
                  <Input
                    type="text"
                    value={name()}
                    onInput={(e) => setName(e.currentTarget.value)}
                    placeholder="My recipe"
                    autofocus
                  />
                </div>

                <div>
                  <label class="mb-1.5 block text-xs font-medium text-text">Description</label>
                  <Textarea
                    value={description()}
                    onInput={(e) => setDescription(e.currentTarget.value)}
                    placeholder="What does this recipe do?"
                    rows={2}
                  />
                </div>

                <div>
                  <label class="mb-1.5 block text-xs font-medium text-text">
                    Extracted steps ({result().steps.length})
                  </label>
                  <div class="max-h-48 space-y-1.5 overflow-y-auto rounded-lg border border-border bg-surface p-2">
                    <For each={result().steps}>
                      {(step, index) => (
                        <div class="flex items-center gap-2 rounded bg-surface-muted px-2 py-1.5">
                          <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface text-2xs font-medium text-text-muted">
                            {index() + 1}
                          </span>
                          <span class="text-xs text-text truncate">{step.label}</span>
                          <span class="font-code text-2xs text-text-muted shrink-0">({step.toolName})</span>
                          <Show when={step.dependsOn.length > 0}>
                            <Badge variant="secondary">depends: {step.dependsOn.join(", ")}</Badge>
                          </Show>
                        </div>
                      )}
                    </For>
                  </div>
                </div>

                <Show when={result().outputs.length > 0}>
                  <div>
                    <label class="mb-1.5 block text-xs font-medium text-text">
                      Outputs ({result().outputs.length})
                    </label>
                    <div class="flex flex-wrap gap-1.5">
                      <For each={result().outputs}>{(output) => <Badge variant="secondary">{output.kind}</Badge>}</For>
                    </div>
                  </div>
                </Show>
              </div>
            )}
          </Show>
        </ModalBody>

        <Show when={isInitialState()}>
          <ModalFooter>
            <Button variant="ghost" size="sm" onClick={props.onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleExtract} disabled={props.modelsLoading || props.models.length === 0}>
              Extract recipe
            </Button>
          </ModalFooter>
        </Show>

        <Show when={!props.extracting && props.extractResult && "steps" in props.extractResult}>
          <ModalFooter>
            <Button variant="ghost" size="sm" onClick={props.onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!name().trim() || props.saving}>
              <Show when={props.saving}>
                <Spinner size="xs" />
              </Show>
              {props.saving ? "Creating..." : "Create recipe"}
            </Button>
          </ModalFooter>
        </Show>
      </ModalContainer>
    </Modal>
  )
}
