import type { SelectOption } from "../../../../ui"
import type { ModelProvider, ApprovalAuthority } from "@synatra/core/types"

export const providerOptions: SelectOption<ModelProvider>[] = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google" },
]

export const modelPresets: Record<ModelProvider, SelectOption<string>[]> = {
  openai: [
    { value: "gpt-5.2", label: "GPT-5.2" },
    { value: "gpt-5.1", label: "GPT-5.1" },
    { value: "o3", label: "o3" },
    { value: "o4-mini", label: "o4 Mini" },
    { value: "gpt-4.1", label: "GPT-4.1" },
    { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  ],
  anthropic: [
    { value: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
    { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
    { value: "claude-opus-4-5-20251101", label: "Claude Opus 4.5" },
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
    { value: "claude-3-7-sonnet-20250219", label: "Claude 3.7 Sonnet" },
  ],
  google: [
    { value: "gemini-3-pro-preview", label: "Gemini 3 Pro" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  ],
}

export const approvalAuthorityOptions: SelectOption<ApprovalAuthority>[] = [
  { value: "any_member", label: "Any member" },
  { value: "owner_only", label: "Channel owners only" },
]

export const approvalTimeoutOptions: SelectOption<number>[] = [
  { value: 3600000, label: "1 hour" },
  { value: 86400000, label: "24 hours" },
  { value: 259200000, label: "72 hours" },
  { value: 604800000, label: "1 week" },
]

export const effortOptions: SelectOption<string>[] = [
  { value: "", label: "Disabled" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra High" },
]

export const levelOptions: SelectOption<string>[] = [
  { value: "", label: "Disabled" },
  { value: "low", label: "Low" },
  { value: "high", label: "High" },
]

export const versionModeOptions: SelectOption<"current" | "fixed">[] = [
  { value: "current", label: "Current (always latest)" },
  { value: "fixed", label: "Fixed release" },
]

export type ParameterDef = {
  name: string
  type: string
  required?: boolean
  description: string
  children?: ParameterDef[]
}

export const TOOL_SAMPLES: Record<string, object> = {
  output_table: {
    columns: [
      { key: "name", label: "Name" },
      { key: "email", label: "Email" },
    ],
    data: [
      { name: "Alice", email: "alice@example.com" },
      { name: "Bob", email: "bob@example.com" },
    ],
    name: "Users",
  },
  output_chart: {
    type: "line",
    data: {
      labels: ["Jan", "Feb", "Mar"],
      datasets: [{ label: "Sales", data: [100, 150, 200] }],
    },
    name: "Monthly Sales",
  },
  output_markdown: {
    content: "## Summary\n\n- Item 1\n- Item 2",
    name: "Report",
  },
  output_key_value: {
    pairs: { Environment: "Production", Version: "1.2.3" },
    name: "Status",
  },
  human_request: {
    title: "Complete Setup",
    description: "Please provide the required information.",
    fields: [
      {
        kind: "form",
        key: "profile",
        schema: { type: "object", properties: { name: { type: "string", title: "Name" } }, required: ["name"] },
      },
      {
        kind: "question",
        key: "framework",
        questions: [
          {
            question: "Which framework should we use?",
            header: "Framework",
            options: [
              { label: "React", description: "Popular frontend library" },
              { label: "Vue", description: "Progressive framework" },
            ],
            multiSelect: false,
          },
        ],
      },
    ],
    allowCancel: true,
    allowSkip: false,
  },
  task_complete: {
    summary: "## Task Completed\n\nCreated user account:\n- **Email:** john@example.com\n- **Role:** Admin",
  },
  return_to_parent: {
    result: { status: "success", data: { userId: "123" } },
    summary: "Fetched user data successfully.",
  },
  code_execute: {
    code: "return params.users.filter(u => u.active).map(u => u.name);",
    params: {
      users: [
        { name: "Alice", active: true },
        { name: "Bob", active: false },
      ],
    },
    timeout: 10000,
  },
}

export const TOOL_PARAMS: Record<string, ParameterDef[]> = {
  output_table: [
    {
      name: "columns",
      type: "array",
      required: true,
      description: "Column definitions.",
      children: [
        { name: "key", type: "string", required: true, description: "Property key in data objects." },
        { name: "label", type: "string", required: true, description: "Column header text." },
      ],
    },
    { name: "data", type: "object[]", required: true, description: "Array of row objects." },
    { name: "name", type: "string", description: "Optional table title." },
  ],
  output_chart: [
    { name: "type", type: "enum", required: true, description: "Chart type: 'line', 'bar', or 'pie'." },
    {
      name: "data",
      type: "object",
      required: true,
      description: "Chart.js compatible data object.",
      children: [
        { name: "labels", type: "string[]", required: true, description: "X-axis labels." },
        {
          name: "datasets",
          type: "array",
          required: true,
          description: "Array of dataset objects.",
          children: [
            { name: "label", type: "string", description: "Dataset legend label." },
            { name: "data", type: "number[]", required: true, description: "Data values." },
          ],
        },
      ],
    },
    { name: "name", type: "string", description: "Optional chart title." },
  ],
  output_markdown: [
    { name: "content", type: "string", required: true, description: "Markdown formatted text content." },
    { name: "name", type: "string", description: "Optional label for the output." },
  ],
  output_key_value: [
    { name: "pairs", type: "Record<string, string>", required: true, description: "Key-value pairs to display." },
    { name: "name", type: "string", description: "Optional title." },
  ],
  human_request: [
    { name: "title", type: "string", required: true, description: "Request title displayed to user." },
    { name: "description", type: "string", description: "Instructions or context." },
    {
      name: "fields",
      type: "array",
      required: true,
      description: "Input fields to collect.",
      children: [
        {
          name: "kind",
          type: "enum",
          required: true,
          description: "Field type: form, question, select_rows, confirm.",
        },
        { name: "key", type: "string", required: true, description: "Result key for this field." },
        { name: "schema", type: "object", description: "JSON Schema for form fields." },
        { name: "questions", type: "array", description: "Questions for question fields." },
        { name: "columns", type: "array", description: "Column definitions for select_rows." },
        { name: "data", type: "array", description: "Row data for select_rows." },
        { name: "variant", type: "enum", description: "Visual style for confirm: info, warning, danger." },
      ],
    },
    { name: "allowCancel", type: "boolean", description: "Show Cancel button (default: true)." },
    { name: "allowSkip", type: "boolean", description: "Show Skip button (default: false)." },
  ],
  task_complete: [{ name: "summary", type: "string", description: "Markdown summary of what was accomplished." }],
  return_to_parent: [
    { name: "result", type: "object", required: true, description: "Structured result data to return to parent." },
    { name: "summary", type: "string", description: "Brief summary of what was accomplished." },
  ],
  code_execute: [
    {
      name: "code",
      type: "string",
      required: true,
      description:
        "JavaScript code to execute. Use 'return' to output results. Access parameters via 'params' variable.",
    },
    { name: "params", type: "object", description: "Parameters accessible as 'params' variable in code." },
    { name: "timeout", type: "number", description: "Execution timeout in milliseconds (100-30000, default: 10000)." },
  ],
}
