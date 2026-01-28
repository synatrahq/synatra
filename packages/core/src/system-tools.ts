import { MAX_SUBAGENT_DEPTH } from "./types/system-tool"

export type SystemToolDefinition = {
  name: string
  description: string
  params: Record<string, unknown>
}

export const COMPUTE_TOOLS: SystemToolDefinition[] = [
  {
    name: "code_execute",
    description: "Execute JavaScript code for calculations and data transformations. No database or API access.",
    params: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description:
            "JavaScript code to execute. Use 'return' to output results. Access input data via 'input' variable.",
        },
        input: {
          type: "object",
          description: "Input data accessible as 'input' variable in code.",
        },
        timeout: {
          type: "number",
          minimum: 100,
          maximum: 30000,
          default: 10000,
          description: "Execution timeout in milliseconds",
        },
      },
      required: ["code"],
    },
  },
]

export const OUTPUT_TOOLS: SystemToolDefinition[] = [
  {
    name: "output_table",
    description: "Display data as a formatted table.",
    params: {
      type: "object",
      properties: {
        columns: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: { type: "string" },
              label: { type: "string" },
            },
            required: ["key", "label"],
          },
        },
        data: { type: "array", items: { type: "object" } },
        name: { type: "string" },
      },
      required: ["columns", "data"],
    },
  },
  {
    name: "output_chart",
    description: "Display data as a chart.",
    params: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["line", "bar", "pie"], description: "Chart type" },
        data: {
          type: "object",
          properties: {
            labels: { type: "array", items: { type: "string" } },
            datasets: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  data: { type: "array", items: { type: "number" } },
                },
                required: ["data"],
              },
            },
          },
          required: ["labels", "datasets"],
        },
        name: { type: "string" },
      },
      required: ["type", "data"],
    },
  },
  {
    name: "output_markdown",
    description: "Display markdown formatted content.",
    params: {
      type: "object",
      properties: {
        content: { type: "string", description: "Markdown content" },
        name: { type: "string" },
      },
      required: ["content"],
    },
  },
  {
    name: "output_key_value",
    description: "Display key-value pairs.",
    params: {
      type: "object",
      properties: {
        pairs: { type: "object", description: "Key-value pairs as { key: value }" },
        name: { type: "string" },
      },
      required: ["pairs"],
    },
  },
]

export const HUMAN_TOOLS: SystemToolDefinition[] = [
  {
    name: "human_request",
    description: "Request input from user. Run pauses until response.",
    params: {
      type: "object",
      properties: {
        title: { type: "string", description: "Title of the request" },
        description: { type: "string", description: "Optional description" },
        fields: {
          type: "array",
          description: "Input fields to request from user",
          items: {
            type: "object",
            properties: {
              kind: {
                type: "string",
                enum: ["form", "question", "select_rows", "confirm"],
                description: "Type of input field",
              },
              key: { type: "string", description: "Unique key for this field's response" },
              schema: { type: "object", description: "JSON Schema for form (kind=form)" },
              defaults: { type: "object", description: "Default values (kind=form)" },
              questions: {
                type: "array",
                description: "Questions with options (kind=question)",
                items: {
                  type: "object",
                  properties: {
                    question: { type: "string" },
                    header: { type: "string", maxLength: 12 },
                    options: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          label: { type: "string" },
                          description: { type: "string" },
                        },
                        required: ["label", "description"],
                      },
                      minItems: 2,
                      maxItems: 4,
                    },
                    multiSelect: { type: "boolean", default: false },
                  },
                  required: ["question", "header", "options"],
                },
              },
              columns: {
                type: "array",
                description: "Table columns (kind=select_rows)",
                items: {
                  type: "object",
                  properties: {
                    key: { type: "string" },
                    label: { type: "string" },
                  },
                  required: ["key", "label"],
                },
              },
              data: {
                type: "array",
                description: "Table data (kind=select_rows)",
                items: { type: "object" },
              },
              selectionMode: {
                type: "string",
                enum: ["single", "multiple"],
                default: "multiple",
                description: "Selection mode (kind=select_rows)",
              },
              allowNone: { type: "boolean", default: true, description: "Allow none selection (kind=select_rows)" },
              confirmLabel: { type: "string", default: "Confirm", description: "Confirm button label (kind=confirm)" },
              rejectLabel: { type: "string", default: "Reject", description: "Reject button label (kind=confirm)" },
              variant: {
                type: "string",
                enum: ["info", "warning", "danger"],
                default: "info",
                description: "Visual variant (kind=confirm)",
              },
            },
            required: ["kind", "key"],
          },
          minItems: 1,
        },
      },
      required: ["title", "fields"],
    },
  },
]

export const COMPLETION_TOOLS: SystemToolDefinition[] = [
  {
    name: "task_complete",
    description: "Mark the run as completed.",
    params: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Brief summary of what was accomplished" },
      },
    },
  },
  {
    name: "return_to_parent",
    description: "Return result to parent run and complete this subagent run.",
    params: {
      type: "object",
      properties: {
        result: { type: "object", description: "Structured result data" },
        summary: { type: "string", description: "Brief summary" },
      },
      required: ["result"],
    },
  },
]

export interface SubagentConfig {
  agentId: string
  alias: string
  description: string
  versionMode: "current" | "fixed"
  releaseId?: string
}

export function getSystemTools(
  depth: number = 0,
  maxSubagentDepth: number = MAX_SUBAGENT_DEPTH,
  subagents: SubagentConfig[] = [],
): SystemToolDefinition[] {
  const tools: SystemToolDefinition[] = []

  tools.push(...COMPUTE_TOOLS)
  tools.push(...HUMAN_TOOLS)

  if (depth === 0) {
    tools.push(...OUTPUT_TOOLS)
    tools.push(COMPLETION_TOOLS[0])
  } else {
    tools.push(COMPLETION_TOOLS[1])
  }

  if (depth < maxSubagentDepth && subagents.length > 0) {
    tools.push(
      ...subagents.map((s) => ({
        name: `delegate_to_${s.alias}`,
        description: s.description,
        params: {
          type: "object",
          properties: {
            task: { type: "string", description: "Task description for the subagent" },
            dependsOn: {
              type: "array",
              description:
                "Previous subagent results this task depends on. Include when the subagent needs context from earlier delegations.",
              items: {
                type: "object",
                properties: {
                  alias: { type: "string", description: "Alias of the previous subagent (e.g. 'github_agent')" },
                  summary: {
                    type: "string",
                    description: "Brief summary of relevant information from that result (optional, reduces context)",
                  },
                },
                required: ["alias"],
              },
            },
          },
          required: ["task"],
        },
      })),
    )
  }

  return tools
}

const COMPUTE_TOOL_NAMES = COMPUTE_TOOLS.map((t) => t.name)
const OUTPUT_TOOL_NAMES = OUTPUT_TOOLS.map((t) => t.name)
const HUMAN_TOOL_NAMES = HUMAN_TOOLS.map((t) => t.name)
const COMPLETION_TOOL_NAMES = COMPLETION_TOOLS.map((t) => t.name)
const ALL_SYSTEM_TOOL_NAMES = [
  ...COMPUTE_TOOL_NAMES,
  ...OUTPUT_TOOL_NAMES,
  ...HUMAN_TOOL_NAMES,
  ...COMPLETION_TOOL_NAMES,
]

export function isSystemTool(name: string): boolean {
  return ALL_SYSTEM_TOOL_NAMES.includes(name) || name.startsWith("delegate_to_")
}

export function isOutputTool(name: string): boolean {
  return OUTPUT_TOOL_NAMES.includes(name)
}

export function isHumanTool(name: string): boolean {
  return HUMAN_TOOL_NAMES.includes(name)
}

export function isCompletionTool(name: string): boolean {
  return COMPLETION_TOOL_NAMES.includes(name)
}

export function isDelegationTool(name: string): boolean {
  return name.startsWith("delegate_to_")
}

export function isComputeTool(name: string): boolean {
  return COMPUTE_TOOL_NAMES.includes(name)
}
