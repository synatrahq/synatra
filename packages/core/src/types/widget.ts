export type CopilotQuestionOption = {
  label: string
  description: string
}

export type CopilotQuestion = {
  question: string
  header: string
  options: CopilotQuestionOption[]
  multiSelect: boolean
}

export type CopilotQuestionResult = {
  questionIndex: number
  selected: string[]
  otherText?: string
}

export type AskQuestionsParams = {
  questions: CopilotQuestion[]
}

export type AskQuestionsResult = {
  answers: CopilotQuestionResult[]
}
