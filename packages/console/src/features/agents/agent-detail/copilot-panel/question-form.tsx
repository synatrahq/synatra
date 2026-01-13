import { For, Show, createSignal, createMemo } from "solid-js"
import { Button, Checkbox, Spinner, Input, Badge } from "../../../../ui"
import { ArrowLeft, ArrowRight, Check, PencilSimple } from "phosphor-solid-js"
import type { CopilotQuestion, CopilotQuestionResult } from "./types"

type QuestionFormProps = {
  questions: CopilotQuestion[]
  onSubmit: (results: CopilotQuestionResult[]) => void
  submitting: boolean
}

type QuestionState = {
  selected: Set<string>
  otherText: string
  showOther: boolean
}

export function QuestionForm(props: QuestionFormProps) {
  const [currentStep, setCurrentStep] = createSignal(0)
  const [states, setStates] = createSignal<Map<number, QuestionState>>(new Map())

  const totalSteps = () => props.questions.length
  const isConfirmStep = () => currentStep() === totalSteps()
  const currentQuestion = () => props.questions[currentStep()]

  const getState = (index: number): QuestionState => {
    return states().get(index) ?? { selected: new Set(), otherText: "", showOther: false }
  }

  const updateState = (index: number, updates: Partial<QuestionState>) => {
    setStates((prev) => {
      const next = new Map(prev)
      const current = getState(index)
      next.set(index, { ...current, ...updates })
      return next
    })
  }

  const handleOptionToggle = (label: string, multiSelect: boolean) => {
    const idx = currentStep()
    const state = getState(idx)
    const newSelected = new Set(state.selected)

    if (multiSelect) {
      if (newSelected.has(label)) {
        newSelected.delete(label)
      } else {
        newSelected.add(label)
      }
    } else {
      newSelected.clear()
      newSelected.add(label)
    }

    updateState(idx, { selected: newSelected, showOther: false, otherText: "" })
  }

  const handleOtherToggle = (multiSelect: boolean) => {
    const idx = currentStep()
    const state = getState(idx)
    if (multiSelect) {
      updateState(idx, { showOther: !state.showOther })
    } else {
      updateState(idx, { selected: new Set(), showOther: true })
    }
  }

  const canProceed = createMemo(() => {
    if (isConfirmStep()) return true
    const state = getState(currentStep())
    return state.selected.size > 0 || (state.showOther && state.otherText.trim().length > 0)
  })

  const handleNext = () => {
    if (!canProceed()) return
    setCurrentStep((prev) => Math.min(prev + 1, totalSteps()))
  }

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0))
  }

  const handleEdit = (index: number) => {
    setCurrentStep(index)
  }

  const handleSubmit = () => {
    if (props.submitting) return

    const results: CopilotQuestionResult[] = props.questions.map((_, idx) => {
      const state = getState(idx)
      const selected = Array.from(state.selected)
      const otherText = state.showOther && state.otherText.trim() ? state.otherText.trim() : undefined
      return { questionIndex: idx, selected, otherText }
    })

    props.onSubmit(results)
  }

  const formatAnswer = (index: number): string => {
    const state = getState(index)
    const parts: string[] = []
    if (state.selected.size > 0) {
      parts.push(Array.from(state.selected).join(", "))
    }
    if (state.showOther && state.otherText.trim()) {
      parts.push(`Other: ${state.otherText.trim()}`)
    }
    return parts.length > 0 ? parts.join(" + ") : "(no answer)"
  }

  return (
    <div class="rounded-lg border border-border bg-surface-elevated p-3">
      <div class="flex items-center gap-2 mb-3">
        <div class="flex gap-1">
          <For each={props.questions}>
            {(_, idx) => (
              <div
                class="h-1.5 w-6 rounded-full transition-colors"
                classList={{
                  "bg-accent": idx() < currentStep() || isConfirmStep(),
                  "bg-accent/50": idx() === currentStep() && !isConfirmStep(),
                  "bg-border": idx() > currentStep(),
                }}
              />
            )}
          </For>
          <div
            class="h-1.5 w-6 rounded-full transition-colors"
            classList={{
              "bg-accent": isConfirmStep(),
              "bg-border": !isConfirmStep(),
            }}
          />
        </div>
        <span class="text-2xs text-text-muted ml-auto">
          {isConfirmStep() ? "Confirm" : `${currentStep() + 1} / ${totalSteps()}`}
        </span>
      </div>

      <Show
        when={!isConfirmStep()}
        fallback={
          <div class="space-y-3">
            <div class="text-xs font-medium text-text mb-2">Confirm your answers</div>
            <For each={props.questions}>
              {(question, idx) => (
                <div class="p-2 rounded bg-surface">
                  <div class="flex items-start justify-between gap-2 mb-1">
                    <Badge variant="default">{question.header}</Badge>
                    <button
                      type="button"
                      onClick={() => handleEdit(idx())}
                      class="p-1 rounded hover:bg-surface-elevated text-text-muted hover:text-text transition-colors shrink-0"
                    >
                      <PencilSimple class="h-3 w-3" />
                    </button>
                  </div>
                  <div class="text-2xs text-text-muted mb-1">{question.question}</div>
                  <div class="text-xs text-text font-medium">{formatAnswer(idx())}</div>
                </div>
              )}
            </For>
          </div>
        }
      >
        {(() => {
          const question = currentQuestion()
          const state = () => getState(currentStep())
          const isOtherSelected = () => state().showOther

          return (
            <div class="space-y-2">
              <div>
                <Badge variant="default">{question.header}</Badge>
                <div class="text-xs text-text mt-1">{question.question}</div>
              </div>

              <div class="space-y-1.5 pl-1">
                <For each={question.options}>
                  {(option) => {
                    const isSelected = () => state().selected.has(option.label)

                    return (
                      <Show
                        when={question.multiSelect}
                        fallback={
                          <label class="flex cursor-pointer items-start gap-2 rounded p-1.5 hover:bg-surface transition-colors">
                            <span class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border bg-surface mt-0.5">
                              <span
                                class="h-2 w-2 rounded-full transition-colors"
                                classList={{ "bg-accent": isSelected(), "bg-transparent": !isSelected() }}
                              />
                            </span>
                            <input
                              type="radio"
                              name={`question-${currentStep()}`}
                              checked={isSelected()}
                              onChange={() => handleOptionToggle(option.label, false)}
                              disabled={props.submitting}
                              class="hidden"
                            />
                            <div class="flex-1 min-w-0">
                              <div class="text-xs font-medium text-text">{option.label}</div>
                              <div class="text-2xs text-text-muted">{option.description}</div>
                            </div>
                          </label>
                        }
                      >
                        <label class="flex cursor-pointer items-start gap-2 rounded p-1.5 hover:bg-surface transition-colors">
                          <Checkbox
                            checked={isSelected()}
                            onChange={() => handleOptionToggle(option.label, true)}
                            disabled={props.submitting}
                            class="mt-0.5"
                          />
                          <div class="flex-1 min-w-0">
                            <div class="text-xs font-medium text-text">{option.label}</div>
                            <div class="text-2xs text-text-muted">{option.description}</div>
                          </div>
                        </label>
                      </Show>
                    )
                  }}
                </For>

                <Show
                  when={question.multiSelect}
                  fallback={
                    <label class="flex cursor-pointer items-start gap-2 rounded p-1.5 hover:bg-surface transition-colors">
                      <span class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border bg-surface mt-0.5">
                        <span
                          class="h-2 w-2 rounded-full transition-colors"
                          classList={{ "bg-accent": isOtherSelected(), "bg-transparent": !isOtherSelected() }}
                        />
                      </span>
                      <input
                        type="radio"
                        name={`question-${currentStep()}`}
                        checked={isOtherSelected()}
                        onChange={() => handleOtherToggle(false)}
                        disabled={props.submitting}
                        class="hidden"
                      />
                      <div class="flex-1 min-w-0">
                        <div class="text-xs font-medium text-text">Other</div>
                        <div class="text-2xs text-text-muted">Enter a custom response</div>
                      </div>
                    </label>
                  }
                >
                  <label class="flex cursor-pointer items-start gap-2 rounded p-1.5 hover:bg-surface transition-colors">
                    <Checkbox
                      checked={isOtherSelected()}
                      onChange={() => handleOtherToggle(true)}
                      disabled={props.submitting}
                      class="mt-0.5"
                    />
                    <div class="flex-1 min-w-0">
                      <div class="text-xs font-medium text-text">Other</div>
                      <div class="text-2xs text-text-muted">Enter a custom response</div>
                    </div>
                  </label>
                </Show>

                <Show when={isOtherSelected()}>
                  <div class="pl-6">
                    <Input
                      value={state().otherText}
                      onInput={(e) => updateState(currentStep(), { otherText: e.currentTarget.value })}
                      placeholder="Enter your response..."
                      disabled={props.submitting}
                      class="text-xs"
                    />
                  </div>
                </Show>
              </div>
            </div>
          )
        })()}
      </Show>

      <div class="flex justify-between pt-3 mt-3 border-t border-border">
        <Show when={currentStep() > 0}>
          <Button variant="outline" size="sm" onClick={handleBack} disabled={props.submitting}>
            <ArrowLeft class="h-3 w-3 mr-1" />
            Back
          </Button>
        </Show>
        <span class="flex-1" />
        <Show
          when={isConfirmStep()}
          fallback={
            <Button variant="default" size="sm" onClick={handleNext} disabled={!canProceed() || props.submitting}>
              Next
              <ArrowRight class="h-3 w-3 ml-1" />
            </Button>
          }
        >
          <Button variant="default" size="sm" onClick={handleSubmit} disabled={props.submitting}>
            <Show when={props.submitting} fallback={<Check class="h-3 w-3 mr-1" weight="bold" />}>
              <Spinner size="xs" class="border-white border-t-transparent mr-1" />
            </Show>
            Submit
          </Button>
        </Show>
      </div>
    </div>
  )
}
