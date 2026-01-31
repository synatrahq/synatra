import type { AgentTool } from "./types"
import { COMPUTE_TOOLS, OUTPUT_TOOLS, HUMAN_TOOLS } from "./system-tools"

export const RECIPE_EXTRACTION_PROMPT_V2 = `<role>
You are an expert at extracting reusable workflow recipes from conversation logs.
Your goal: Transform a specific conversation into a GENERALIZED, PARAMETERIZED workflow.
</role>

<critical_understanding>
## What is a Recipe?

A Recipe captures the ESSENCE of what was accomplished, not the specific data.

### The Conversation vs The Recipe
| Conversation | Recipe |
|--------------|--------|
| "Get orders for customer ABC123" | "Get orders for ANY customer" |
| Specific IDs, names, dates | Input parameters the user provides |
| Fixed data in tool results | Dynamic bindings to previous steps |
| Shown specific columns | Display ALL columns the tool returns |

### Step Types
| Type | Purpose | When to Use |
|------|---------|-------------|
| query | Call agent tools | Fetching data from APIs/databases |
| code | Transform data | Filtering, mapping, calculating |
| output | Display results | Tables, charts, markdown |
| input | Get user input mid-flow | When recipe needs decisions during execution |

### Data Flow via Bindings
Data flows between steps through bindings. This is the core mechanism:
- Step A returns data → Step B references it via binding → Step C uses transformed data
</critical_understanding>

<binding_reference>
## ParamBinding Types

Every parameter value comes from a binding. Choose the right type:

### Decision Tree
Is the value always constant?
- YES → literal
- NO → Should user provide it at start?
  - YES → ref (scope=input) (define in inputs array first)
  - NO → From previous step?
    - YES → Can get with simple path?
      - YES → ref (scope=step, with optional path)
      - NO (needs logic) → Create code step, then ref to its output
    - NO → Combining multiple values?
      - Into string → template
      - Into object → object
      - Into array → array

### Binding Formats

literal - Constant values
Example: { "type": "literal", "value": "SELECT * FROM users" }

ref - Reference input or step output
Example input: { "type": "ref", "scope": "input", "key": "customer_id" }
Example step: { "type": "ref", "scope": "step", "key": "fetch_users" }
Example path: { "type": "ref", "scope": "step", "key": "fetch_users", "path": ["data", 0, "id"] }
Example map: { "type": "ref", "scope": "step", "key": "fetch_users", "path": ["data", "*", "email"] }
Optional cast: "as": "string" | "number" | "boolean" | "object" | "array"

template - String interpolation (always returns string)
Example: { "type": "template", "parts": ["User ", { "type": "ref", "scope": "step", "key": "fetch_users", "path": ["data", 0, "name"] }, " (ID: ", { "type": "ref", "scope": "step", "key": "fetch_users", "path": ["data", 0, "id"] }, ")"] }

object - Construct object from multiple bindings
Example: { "type": "object", "entries": { "userId": ..., "date": ... } }

array - Construct array from multiple bindings
Example: { "type": "array", "items": [..., ...] }
</binding_reference>

<extraction_rules>
## Extraction Rules

### Rule 1: Parameterize Magic Values
Concrete values from conversation (IDs, names, dates, thresholds) → become inputs

BAD: { "type": "literal", "value": "ABC123" }
GOOD: Define input customer_id, use { "type": "ref", "scope": "input", "key": "customer_id" }

### Rule 2: Never Hardcode Tool Results
If data came from a tool, reference it dynamically.

BAD: { "type": "literal", "value": [{"id": 1}, {"id": 2}] }
GOOD: { "type": "ref", "scope": "step", "key": "fetch_data" }

### Rule 3: Every Step Must Be Consumed
A step is valid only if:
- Its result is used by another step via ref, OR
- It is an output step (displays to user)

IMPORTANT: Remove exploration/debugging steps that aren't part of the final workflow.

### Rule 4: Display ALL Available Data
Output steps should show everything the tool returns, not just what was shown in conversation.

### Rule 5: code_execute Input Must Be Object
Always wrap arrays in object binding.
Example:
{
  "input": {
    "type": "object",
    "entries": {
      "items": { "type": "ref", "scope": "step", "key": "fetch_items" }
    }
  }
}

### Rule 6: Step Order = Dependency Order
Steps execute in array order. Only reference EARLIER steps.

### Rule 7: Exclude Confirmation Steps
human_request with kind=confirm is for one-time decisions, not reusable recipes.

### Rule 8: select_rows Data Binding
When using human_request with select_rows, data must be a ParamBinding.
Example:
{
  "kind": "select_rows",
  "key": "selected",
  "columns": [...],
  "data": { "type": "ref", "scope": "step", "key": "previous_step" },
  "selectionMode": "multiple"
}

### Rule 9: form Defaults Binding
Use defaults with a ParamBinding to pre-fill form fields from previous step results.
Example:
{
  "kind": "form",
  "key": "user_input",
  "schema": { "type": "object", "properties": { "name": { "type": "string" }, "email": { "type": "string" } } },
  "defaults": { "type": "ref", "scope": "step", "key": "select_user", "path": ["responses", "user", "selectedRows", 0] }
}
The resolved object's keys are matched to form field names automatically.
</extraction_rules>

<input_step_results>
## Input Step (human_request) Result Structure

When an input step completes, its result is stored and can be referenced by later steps.

### select_rows Result
{
  "responses": {
    "<field_key>": {
      "selectedRows": [
        { "id": 1, "name": "Alice", "email": "alice@example.com" },
        { "id": 2, "name": "Bob", "email": "bob@example.com" }
      ]
    }
  }
}
Access pattern: { "type": "ref", "scope": "step", "key": "select_step", "path": ["responses", "<field_key>", "selectedRows"] }
Single row: "path": ["responses", "<field_key>", "selectedRows", 0]
Specific field: "path": ["responses", "<field_key>", "selectedRows", 0, "id"]

### form Result
{
  "responses": {
    "<field_key>": {
      "values": {
        "name": "entered name",
        "email": "entered@email.com"
      }
    }
  }
}
Access pattern: { "type": "ref", "scope": "step", "key": "form_step", "path": ["responses", "<field_key>", "values"] }
Specific field: "path": ["responses", "<field_key>", "values", "name"]

### question Result
{
  "responses": {
    "<field_key>": {
      "answers": { "<question_header>": "selected_option" }
    }
  }
}
</input_step_results>

<thinking_process>
## Before Generating JSON

Work through these steps:

1. INTENT: What is the user's generalizable goal? (not "get customer ABC123" but "get any customer")
2. MAGIC VALUES: List concrete values (IDs, names, dates) that should become inputs
3. DATA FLOW: Trace how data moves between steps
4. VALIDATION: Every ref binding points to an earlier step or defined input?
</thinking_process>

<examples>
## Examples

### Example 1: Query + Display

Conversation: User asks for orders for customer ABC123

Recipe:
{
  "name": "Customer Orders",
  "inputs": [
    { "key": "customer_id", "label": "Customer ID", "type": "string", "required": true }
  ],
  "steps": [
    {
      "stepKey": "fetch_orders",
      "label": "Fetch orders",
      "toolName": "get_orders",
      "params": {
        "customer_id": { "type": "ref", "scope": "input", "key": "customer_id" }
      }
    },
    {
      "stepKey": "display",
      "label": "Display orders",
      "toolName": "output_table",
      "params": {
        "columns": { "type": "literal", "value": [
          { "key": "order_id", "label": "Order ID" },
          { "key": "amount", "label": "Amount" },
          { "key": "status", "label": "Status" }
        ]},
        "data": { "type": "ref", "scope": "step", "key": "fetch_orders" }
      }
    }
  ]
}

Key points:
- "ABC123" → input (parameterized)
- data binding references fetch_orders directly

### Example 2: Query + Transform + Display

Conversation: Calculate total revenue by status

Recipe:
{
  "name": "Revenue by Status",
  "inputs": [
    { "key": "customer_id", "label": "Customer ID", "type": "string", "required": true }
  ],
  "steps": [
    {
      "stepKey": "fetch_orders",
      "label": "Fetch orders",
      "toolName": "get_orders",
      "params": {
        "customer_id": { "type": "ref", "scope": "input", "key": "customer_id" }
      }
    },
    {
      "stepKey": "group_revenue",
      "label": "Group by status",
      "toolName": "code_execute",
      "params": {
        "code": { "type": "literal", "value": "const grouped = {}; for (const o of input.orders) { grouped[o.status] = (grouped[o.status] || 0) + o.amount; } return Object.entries(grouped).map(([status, total]) => ({ status, total }));" },
        "input": {
          "type": "object",
          "entries": {
            "orders": { "type": "ref", "scope": "step", "key": "fetch_orders" }
          }
        }
      }
    },
    {
      "stepKey": "display",
      "label": "Display revenue",
      "toolName": "output_table",
      "params": {
        "columns": { "type": "literal", "value": [
          { "key": "status", "label": "Status" },
          { "key": "total", "label": "Total" }
        ]},
        "data": { "type": "ref", "scope": "step", "key": "group_revenue" }
      }
    }
  ]
}

Key points:
- code_execute input MUST be object (wrap array in entries)
- Access as input.orders in code

### Example 3: User Selection Mid-Flow

Conversation: Let user select rows then process them

Recipe:
{
  "name": "Process Selected Users",
  "inputs": [],
  "steps": [
    {
      "stepKey": "fetch_users",
      "label": "Fetch users",
      "toolName": "get_users",
      "params": {
        "status": { "type": "literal", "value": "active" }
      }
    },
    {
      "stepKey": "select_users",
      "label": "Select users",
      "toolName": "human_request",
      "params": {
        "title": { "type": "literal", "value": "Select Users" },
        "fields": { "type": "literal", "value": [{
          "kind": "select_rows",
          "key": "selected",
          "columns": [{ "key": "name", "label": "Name" }, { "key": "email", "label": "Email" }],
          "data": { "type": "ref", "scope": "step", "key": "fetch_users" },
          "selectionMode": "multiple"
        }]}
      }
    },
    {
      "stepKey": "process",
      "label": "Process selected",
      "toolName": "code_execute",
      "params": {
        "code": { "type": "literal", "value": "return input.users.map(u => u.email)" },
        "input": {
          "type": "object",
          "entries": {
            "users": { "type": "ref", "scope": "step", "key": "select_users", "path": ["responses", "selected", "selectedRows"] }
          }
        }
      }
    }
  ]
}

Key points:
- select_rows data is a ref binding
- Access selection via path: ["responses", "<field_key>", "selectedRows"]

### Example 4: Template for Markdown

Conversation: Show user summary report

Recipe:
{
  "name": "User Summary",
  "inputs": [
    { "key": "user_id", "label": "User ID", "type": "string", "required": true }
  ],
  "steps": [
    {
      "stepKey": "fetch_stats",
      "label": "Fetch stats",
      "toolName": "get_user_stats",
      "params": {
        "user_id": { "type": "ref", "scope": "input", "key": "user_id" }
      }
    },
    {
      "stepKey": "display",
      "label": "Display report",
      "toolName": "output_markdown",
      "params": {
        "content": {
          "type": "template",
          "parts": [
            "## ",
            { "type": "ref", "scope": "step", "key": "fetch_stats", "path": ["name"] },
            "\n\n**Orders:** ",
            { "type": "ref", "scope": "step", "key": "fetch_stats", "path": ["orders"] },
            "\n**Revenue:** $",
            { "type": "ref", "scope": "step", "key": "fetch_stats", "path": ["revenue"] }
          ]
        }
      }
    }
  ]
}

Key points:
- template.parts alternates strings and ref bindings
- Each ref extracts a specific field via path
</examples>

<common_mistakes>
## Common Mistakes

1. Using literal for variable data
   BAD: { "type": "literal", "value": "ABC123" }
   GOOD: { "type": "ref", "scope": "input", "key": "customer_id" }

2. Hardcoding tool results
   BAD: { "type": "literal", "value": [{"id": 1}] }
   GOOD: { "type": "ref", "scope": "step", "key": "fetch_data" }

3. Missing input definition
   BAD: Using ref to input "foo" without defining it in inputs array
   GOOD: Define input first, then reference

4. code_execute with non-object input
   BAD: "input": { "type": "ref", "scope": "step", "key": "items" }
   GOOD: "input": { "type": "object", "entries": { "items": { "type": "ref", ... } } }

5. Referencing future steps
   BAD: Step 0 references step 2
   GOOD: Only reference earlier steps
</common_mistakes>`

export function formatToolsForExtraction(agentTools: AgentTool[]): string {
  const formatTool = (t: { name: string; description: string; params: unknown; returns?: unknown }) => {
    const lines = [
      `### ${t.name}`,
      t.description,
      "",
      "**Params:**",
      "```json",
      JSON.stringify(t.params, null, 2),
      "```",
    ]
    if (t.returns) {
      lines.push("", "**Returns:**", "```json", JSON.stringify(t.returns, null, 2), "```")
    }
    return lines.join("\n")
  }

  const agentToolDocs = agentTools.length > 0 ? agentTools.map(formatTool) : ["(No agent tools)"]

  const systemToolDocs = [...COMPUTE_TOOLS, ...OUTPUT_TOOLS, ...HUMAN_TOOLS].map(formatTool)

  return [
    "<available_tools>",
    "## Agent Tools (from the conversation)",
    "",
    ...agentToolDocs,
    "",
    "## Recipe System Tools",
    "",
    ...systemToolDocs,
    "",
    "### Tools NOT to Include in Recipe",
    "- task_complete: Recipe completes automatically",
    "- human_request with confirm: One-time decisions, not reusable",
    "</available_tools>",
  ].join("\n")
}

export function formatConversationForExtraction(
  messages: Array<{
    type: string
    content: string | null
    toolCall: { id: string; name: string; params: Record<string, unknown> } | null
    toolResult: { toolCallId: string; result: unknown; error?: string } | null
  }>,
  sampleValue: (value: unknown) => unknown,
): string {
  const lines: string[] = ["<conversation_log>"]

  for (const msg of messages) {
    if (msg.type === "user" && msg.content) {
      lines.push("", "## User", msg.content)
    } else if (msg.type === "assistant" && msg.content) {
      lines.push("", "## Assistant", msg.content)
    } else if (msg.type === "tool_call" && msg.toolCall) {
      lines.push(
        "",
        `## Tool Call: ${msg.toolCall.name}`,
        "```json",
        JSON.stringify(msg.toolCall.params, null, 2),
        "```",
      )
    } else if (msg.type === "tool_result" && msg.toolResult) {
      if (msg.toolResult.error) {
        lines.push("", "## Tool Result (ERROR)", msg.toolResult.error)
      } else {
        const sampled = sampleValue(msg.toolResult.result)
        lines.push("", "## Tool Result", "```json", JSON.stringify(sampled, null, 2), "```")
      }
    }
  }

  lines.push("", "</conversation_log>")
  return lines.join("\n")
}

export function buildExtractionPromptV2(
  agentTools: AgentTool[],
  messages: Array<{
    type: string
    content: string | null
    toolCall: { id: string; name: string; params: Record<string, unknown> } | null
    toolResult: { toolCallId: string; result: unknown; error?: string } | null
  }>,
  sampleValue: (value: unknown) => unknown,
): string {
  const toolsDocs = formatToolsForExtraction(agentTools)
  const conversationLog = formatConversationForExtraction(messages, sampleValue)

  return `${RECIPE_EXTRACTION_PROMPT_V2}

---

${toolsDocs}

---

${conversationLog}

---

<final_instructions>
Now extract the recipe from this conversation.

Before calling submit_recipe:
1. Identify the user's INTENT (the generalizable goal, not specific data)
2. List all magic values that should become inputs
3. Trace the data flow between steps
4. Verify every step binding references an earlier step
5. Verify every input binding has a corresponding input definition

Call submit_recipe with the complete recipe JSON.
</final_instructions>`
}

export function buildRetryPrompt(errors: string[]): string {
  return `<validation_errors>
The recipe validation failed with these errors:
${errors.map((e) => `- ${e}`).join("\n")}
</validation_errors>

<fix_instructions>
Please fix these issues:

1. For "references non-existent input": Make sure the input is defined in the "inputs" array
2. For "not a preceding step": Reorder steps so referenced step comes before the referencing step
3. For "duplicate step key": Use unique snake_case keys for each step

Think through each error carefully, then submit a corrected recipe.
</fix_instructions>`
}
