import { createSignal, Show, For } from "solid-js"
import { RadioGroup, CheckboxGroup, Textarea } from "../../ui"
import type { HumanRequestQuestionConfig } from "@synatra/core/types"

type QuestionFieldProps = {
  config: HumanRequestQuestionConfig & { key: string }
  value: Record<string, unknown>
  onChange: (value: Record<string, unknown>) => void
}

export function QuestionField(props: QuestionFieldProps) {
  const questions = () => props.config.questions
  const [otherTexts, setOtherTexts] = createSignal<Record<number, string>>(
    (props.value.__otherTexts as Record<number, string>) ?? {},
  )

  const getAnswers = (idx: number) => ((props.value[idx] as string[]) ?? []) as string[]

  const handleRadioChange = (qIdx: number, value: string) => {
    props.onChange({ ...props.value, [qIdx]: [value] })
  }

  const handleCheckboxChange = (qIdx: number, values: string[]) => {
    const current = getAnswers(qIdx)
    const hasOther = current.includes("__other__")
    props.onChange({ ...props.value, [qIdx]: hasOther ? [...values, "__other__"] : values })
  }

  const selectOtherRadio = (qIdx: number) => {
    props.onChange({ ...props.value, [qIdx]: ["__other__"] })
  }

  const toggleOtherCheckbox = (qIdx: number) => {
    const current = getAnswers(qIdx)
    if (current.includes("__other__")) {
      props.onChange({ ...props.value, [qIdx]: current.filter((l) => l !== "__other__") })
    } else {
      props.onChange({ ...props.value, [qIdx]: [...current, "__other__"] })
    }
  }

  const handleOtherInput = (idx: number, value: string) => {
    setOtherTexts((prev) => ({ ...prev, [idx]: value }))
  }

  const handleOtherBlur = () => {
    props.onChange({ ...props.value, __otherTexts: otherTexts() })
  }

  return (
    <div class="space-y-4">
      <For each={questions()}>
        {(question, idx) => {
          const isMulti = () => question.multiSelect ?? false
          const isOtherSelected = () => getAnswers(idx()).includes("__other__")
          const options = () =>
            question.options.map((opt) => ({
              value: opt.label,
              label: opt.label,
              description: opt.description,
            }))

          return (
            <div class="space-y-2">
              <p class="text-xs text-text font-medium">{question.question}</p>
              <Show
                when={isMulti()}
                fallback={
                  <RadioGroup
                    value={getAnswers(idx()).find((v) => v !== "__other__")}
                    options={options()}
                    onChange={(v) => handleRadioChange(idx(), v)}
                    otherOption={{
                      value: "__other__",
                      selected: isOtherSelected(),
                      onSelect: () => selectOtherRadio(idx()),
                      children: (
                        <Textarea
                          value={otherTexts()[idx()] ?? ""}
                          onInput={(e) => handleOtherInput(idx(), e.currentTarget.value)}
                          onBlur={handleOtherBlur}
                          placeholder="Enter your answer..."
                          rows={2}
                          class="text-xs mt-1"
                        />
                      ),
                    }}
                  />
                }
              >
                <CheckboxGroup
                  value={getAnswers(idx()).filter((v) => v !== "__other__")}
                  options={options()}
                  onChange={(v) => handleCheckboxChange(idx(), v)}
                  otherOption={{
                    value: "__other__",
                    selected: isOtherSelected(),
                    onToggle: () => toggleOtherCheckbox(idx()),
                    children: (
                      <Textarea
                        value={otherTexts()[idx()] ?? ""}
                        onInput={(e) => handleOtherInput(idx(), e.currentTarget.value)}
                        onBlur={handleOtherBlur}
                        placeholder="Enter your answer..."
                        rows={2}
                        class="text-xs mt-1"
                      />
                    ),
                  }}
                />
              </Show>
            </div>
          )
        }}
      </For>
    </div>
  )
}
