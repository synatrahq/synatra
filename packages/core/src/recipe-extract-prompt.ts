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
\`\`\`
Is the value always constant?
├─ YES → static
└─ NO → Should user provide it at start?
         ├─ YES → input (define in inputs array first!)
         └─ NO → From previous step?
                  ├─ YES → Can get with simple path?
                  │         ├─ YES → step (with optional path)
                  │         └─ NO (needs logic) → Create code step, then step binding
                  └─ NO → Combining multiple values?
                           ├─ Into string → template
                           ├─ Into object → object
                           └─ Into array → array
\`\`\`

### Binding Formats

**static** - Constant values
\`{ "type": "static", "value": "SELECT * FROM users" }\`

**input** - User provides at recipe start
\`{ "type": "input", "inputKey": "customer_id" }\`
IMPORTANT: Must define input in "inputs" array first!

**step** - Reference previous step result
\`{ "type": "step", "stepKey": "fetch_users" }\` - whole result
\`{ "type": "step", "stepKey": "fetch_users", "path": "$.data[0].id" }\` - nested value
\`{ "type": "step", "stepKey": "fetch_users", "path": "$[*].email" }\` - map array

**template** - String interpolation
\`{ "type": "template", "template": "User {{name}} (ID: {{id}})", "variables": { "name": ..., "id": ... } }\`

**object** - Construct object from multiple bindings
\`{ "type": "object", "entries": { "userId": ..., "date": ... } }\`

**array** - Construct array from multiple bindings
\`{ "type": "array", "items": [..., ...] }\`
</binding_reference>

<extraction_rules>
## Extraction Rules

### Rule 1: Parameterize Magic Values
Concrete values from conversation (IDs, names, dates, thresholds) → become inputs

[BAD] BAD: \`{ "type": "static", "value": "ABC123" }\`
[GOOD] GOOD: Define input \`customer_id\`, use \`{ "type": "input", "inputKey": "customer_id" }\`

### Rule 2: Never Hardcode Tool Results
If data came from a tool, reference it dynamically.

[BAD] BAD: \`{ "type": "static", "value": [{"id": 1}, {"id": 2}] }\`
[GOOD] GOOD: \`{ "type": "step", "stepKey": "fetch_data" }\`

### Rule 3: Every Step Must Be Consumed
A step is valid only if:
- Its result is used by another step via step binding, OR
- It's an output step (displays to user)

IMPORTANT: Remove exploration/debugging steps that aren't part of the final workflow.

### Rule 4: Display ALL Available Data
Output steps should show everything the tool returns, not just what was shown in conversation.

### Rule 5: code_execute Input Must Be Object
Always wrap arrays in object binding:
\`\`\`json
{
  "input": {
    "type": "object",
    "entries": {
      "items": { "type": "step", "stepKey": "fetch_items" }
    }
  }
}
\`\`\`

### Rule 6: Step Order = Dependency Order
Steps execute in array order. Only reference EARLIER steps.

### Rule 7: Exclude Confirmation Steps
human_request with kind=confirm is for one-time decisions, not reusable recipes.

### Rule 8: select_rows Data Binding
When using human_request with select_rows, "data" must be a ParamBinding:
\`\`\`json
{
  "kind": "select_rows",
  "key": "selected",
  "columns": [...],
  "data": { "type": "step", "stepKey": "previous_step" },
  "selectionMode": "multiple"
}
\`\`\`

### Rule 9: form Defaults Binding
Use "defaults" with a ParamBinding to pre-fill form fields from previous step results:
\`\`\`json
{
  "kind": "form",
  "key": "user_input",
  "schema": { "type": "object", "properties": { "name": { "type": "string" }, "email": { "type": "string" } } },
  "defaults": { "type": "step", "stepKey": "select_user", "path": "$.responses.user.selectedRows[0]" }
}
\`\`\`
The resolved object's keys are matched to form field names automatically.
</extraction_rules>

<input_step_results>
## Input Step (human_request) Result Structure

When an input step completes, its result is stored and can be referenced by later steps.

### select_rows Result
\`\`\`json
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
\`\`\`
Access pattern: \`{ "type": "step", "stepKey": "select_step", "path": "$.responses.<field_key>.selectedRows" }\`
Single row: \`"path": "$.responses.<field_key>.selectedRows[0]"\`
Specific field: \`"path": "$.responses.<field_key>.selectedRows[0].id"\`

### form Result
\`\`\`json
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
\`\`\`
Access pattern: \`{ "type": "step", "stepKey": "form_step", "path": "$.responses.<field_key>.values" }\`
Specific field: \`"path": "$.responses.<field_key>.values.name"\`

### question Result
\`\`\`json
{
  "responses": {
    "<field_key>": {
      "answers": { "<question_header>": "selected_option" }
    }
  }
}
\`\`\`
</input_step_results>

<thinking_process>
## Before Generating JSON

Work through these steps mentally:

### 1. INTENT ANALYSIS
What is the user's actual goal? Not "get customer ABC123's orders" but "analyze any customer's orders".
Ask: What would change if they ran this with different data?

### 2. MAGIC VALUE DETECTION
List every concrete value that should become an input:
- Customer IDs, user IDs, any identifiers
- Date ranges, time periods
- Thresholds, limits
- Names, emails, specific strings

For each: Is this truly variable, or a constant (like a status code)?

### 3. DATA FLOW MAPPING
Trace how data moves:
- What does each tool return? (Look at tool_result in conversation)
- Which fields are used downstream?
- What transformations are needed?

### 4. STEP CONSTRUCTION
For each step:
- What tool or operation?
- What are the params? (with correct bindings)
- What does it return?
- Who consumes it?

### 5. VALIDATION
- Every step binding references an earlier step?
- Every input binding has corresponding input definition?
- Every non-output step is consumed somewhere?
- No circular references?
</thinking_process>

<examples>
## Transformation Examples

### Example 1: Simple Query + Display

<conversation_example>
User: Show me all orders for customer ABC123 from January 2026
Tool Call: get_orders { customer_id: "ABC123", date_from: "2026-01-01", date_to: "2026-01-31" }
Tool Result: [
  { order_id: "ord_1", amount: 100, status: "completed", created_at: "2026-01-05" },
  { order_id: "ord_2", amount: 250, status: "pending", created_at: "2026-01-15" }
]
</conversation_example>

<extracted_recipe>
{
  "name": "Customer Orders Report",
  "description": "Display orders for a customer within a date range",
  "inputs": [
    { "key": "customer_id", "label": "Customer ID", "type": "string", "required": true },
    { "key": "date_from", "label": "Start Date", "type": "string", "required": true },
    { "key": "date_to", "label": "End Date", "type": "string", "required": true }
  ],
  "steps": [
    {
      "stepKey": "fetch_orders",
      "label": "Fetch customer orders",
      "toolName": "get_orders",
      "params": {
        "customer_id": { "type": "input", "inputKey": "customer_id" },
        "date_from": { "type": "input", "inputKey": "date_from" },
        "date_to": { "type": "input", "inputKey": "date_to" }
      }
    },
    {
      "stepKey": "display_orders",
      "label": "Display orders table",
      "toolName": "output_table",
      "params": {
        "columns": { "type": "static", "value": [
          { "key": "order_id", "label": "Order ID" },
          { "key": "amount", "label": "Amount" },
          { "key": "status", "label": "Status" },
          { "key": "created_at", "label": "Created At" }
        ]},
        "data": { "type": "step", "stepKey": "fetch_orders" }
      }
    }
  ],
  "outputs": [{ "stepId": "display_orders", "kind": "table" }]
}
</extracted_recipe>

<explanation>
- "ABC123" → input "customer_id" (user may query different customers)
- Dates → inputs (date range will vary each run)
- output_table uses ALL columns from tool result, not just displayed ones
- data binding references fetch_orders step result directly
</explanation>

---

### Example 2: Query + Transform + Display

<conversation_example>
User: Calculate total revenue by status for customer XYZ
Tool Call: get_orders { customer_id: "XYZ" }
Tool Result: [
  { order_id: "1", amount: 100, status: "completed" },
  { order_id: "2", amount: 200, status: "completed" },
  { order_id: "3", amount: 150, status: "pending" }
]
Assistant: Completed: $300, Pending: $150
</conversation_example>

<extracted_recipe>
{
  "name": "Revenue by Status",
  "description": "Calculate and display revenue grouped by order status",
  "inputs": [
    { "key": "customer_id", "label": "Customer ID", "type": "string", "required": true }
  ],
  "steps": [
    {
      "stepKey": "fetch_orders",
      "label": "Fetch orders",
      "toolName": "get_orders",
      "params": {
        "customer_id": { "type": "input", "inputKey": "customer_id" }
      }
    },
    {
      "stepKey": "calculate_revenue",
      "label": "Group revenue by status",
      "toolName": "code_execute",
      "params": {
        "code": { "type": "static", "value": "const grouped = {}; for (const o of input.orders) { grouped[o.status] = (grouped[o.status] || 0) + o.amount; } return Object.entries(grouped).map(([status, total]) => ({ status, total }));" },
        "input": {
          "type": "object",
          "entries": {
            "orders": { "type": "step", "stepKey": "fetch_orders" }
          }
        }
      }
    },
    {
      "stepKey": "display_revenue",
      "label": "Display revenue breakdown",
      "toolName": "output_table",
      "params": {
        "columns": { "type": "static", "value": [
          { "key": "status", "label": "Status" },
          { "key": "total", "label": "Total Revenue" }
        ]},
        "data": { "type": "step", "stepKey": "calculate_revenue" }
      }
    }
  ],
  "outputs": [{ "stepId": "display_revenue", "kind": "table" }]
}
</extracted_recipe>

<explanation>
- Transformation needed → code_execute step
- code_execute input MUST be object: { "orders": step_binding }
- Access array as input.orders inside code
- Output displays computed result, not raw orders
</explanation>

---

### Example 3: With User Input Mid-Flow (select_rows)

<conversation_example>
User: Let me select which users to email
Tool Call: get_users { status: "active" }
Tool Result: [{ id: 1, email: "a@test.com", name: "Alice" }, { id: 2, email: "b@test.com", name: "Bob" }]
Assistant: Please select users...
User: Selected Alice
Tool Call: send_email { to: "a@test.com", subject: "Hello", body: "..." }
</conversation_example>

<extracted_recipe>
{
  "name": "Email Selected Users",
  "description": "Select active users and send them emails",
  "inputs": [
    { "key": "email_subject", "label": "Email Subject", "type": "string", "required": true },
    { "key": "email_body", "label": "Email Body", "type": "string", "required": true }
  ],
  "steps": [
    {
      "stepKey": "fetch_users",
      "label": "Fetch active users",
      "toolName": "get_users",
      "params": {
        "status": { "type": "static", "value": "active" }
      }
    },
    {
      "stepKey": "select_users",
      "label": "Select users to email",
      "toolName": "human_request",
      "params": {
        "title": { "type": "static", "value": "Select Users to Email" },
        "fields": { "type": "static", "value": [{
          "kind": "select_rows",
          "key": "selected",
          "columns": [{ "key": "name", "label": "Name" }, { "key": "email", "label": "Email" }],
          "data": { "type": "step", "stepKey": "fetch_users" },
          "selectionMode": "multiple"
        }]}
      }
    },
    {
      "stepKey": "send_emails",
      "label": "Send emails to selected users",
      "toolName": "code_execute",
      "params": {
        "code": { "type": "static", "value": "return input.selected.map(u => ({ to: u.email, subject: input.subject, body: input.body }))" },
        "input": {
          "type": "object",
          "entries": {
            "selected": { "type": "step", "stepKey": "select_users", "path": "$.responses.selected.selectedRows" },
            "subject": { "type": "input", "inputKey": "email_subject" },
            "body": { "type": "input", "inputKey": "email_body" }
          }
        }
      }
    }
  ],
  "outputs": []
}
</extracted_recipe>

<explanation>
- "active" status is constant (not parameterized - user always wants active users)
- human_request with select_rows: data binding references fetch_users result
- User selection accessed via path: $.responses.selected.selectedRows
- Email content becomes inputs (will vary each run)
</explanation>

---

### Example 4: Select Row then Update (select_rows → form → query)

<conversation_example>
User: Show users and let me update one
Tool Call: run_select_query { sql: "SELECT id, name, email FROM users" }
Tool Result: [{ id: 1, name: "Alice", email: "alice@ex.com" }, { id: 2, name: "Bob", email: "bob@ex.com" }]
Tool Call: human_request { title: "Select User", fields: [{ kind: "select_rows", key: "user", data: [...], columns: [...], selectionMode: "single" }] }
Tool Result: { responses: { user: { selectedRows: [{ id: 2, name: "Bob", email: "bob@ex.com" }] } } }
Tool Call: human_request { title: "Update", fields: [{ kind: "form", key: "updates", schema: {...}, defaults: { name: "Bob", email: "bob@ex.com" } }] }
Tool Result: { responses: { updates: { values: { name: "Robert", email: "robert@ex.com" } } } }
Tool Call: run_mutation_query { sql: "UPDATE users SET name = 'Robert', email = 'robert@ex.com' WHERE id = 2" }
</conversation_example>

<extracted_recipe>
{
  "name": "Update User Record",
  "description": "Select a user from the list and update their information",
  "inputs": [],
  "steps": [
    {
      "stepKey": "fetch_users",
      "label": "Fetch all users",
      "toolName": "run_select_query",
      "params": {
        "sql": { "type": "static", "value": "SELECT id, name, email FROM users" }
      }
    },
    {
      "stepKey": "select_user",
      "label": "Select user to update",
      "toolName": "human_request",
      "params": {
        "title": { "type": "static", "value": "Select User to Update" },
        "fields": { "type": "static", "value": [{
          "kind": "select_rows",
          "key": "user",
          "columns": [{ "key": "id", "label": "ID" }, { "key": "name", "label": "Name" }, { "key": "email", "label": "Email" }],
          "data": { "type": "step", "stepKey": "fetch_users" },
          "selectionMode": "single"
        }]}
      }
    },
    {
      "stepKey": "get_updates",
      "label": "Enter new values",
      "toolName": "human_request",
      "params": {
        "title": { "type": "static", "value": "Update User Information" },
        "description": { "type": "static", "value": "Edit the values below to update the selected user" },
        "fields": { "type": "static", "value": [{
          "kind": "form",
          "key": "updates",
          "schema": {
            "type": "object",
            "properties": {
              "name": { "type": "string", "description": "Name" },
              "email": { "type": "string", "description": "Email" }
            }
          },
          "defaults": { "type": "step", "stepKey": "select_user", "path": "$.responses.user.selectedRows[0]" }
        }]}
      }
    },
    {
      "stepKey": "build_sql",
      "label": "Build UPDATE SQL",
      "toolName": "code_execute",
      "params": {
        "code": { "type": "static", "value": "const user = input.selectedUser; const updates = input.newValues; const sets = Object.entries(updates).filter(([k,v]) => v).map(([k,v]) => k + ' = \\'' + String(v).replace(/'/g, '\\'\\'' ) + '\\'').join(', '); return 'UPDATE users SET ' + sets + ' WHERE id = ' + user.id;" },
        "input": {
          "type": "object",
          "entries": {
            "selectedUser": { "type": "step", "stepKey": "select_user", "path": "$.responses.user.selectedRows[0]" },
            "newValues": { "type": "step", "stepKey": "get_updates", "path": "$.responses.updates.values" }
          }
        }
      }
    },
    {
      "stepKey": "execute_update",
      "label": "Execute UPDATE",
      "toolName": "run_mutation_query",
      "params": {
        "sql": { "type": "step", "stepKey": "build_sql" },
        "description": { "type": "static", "value": "Update user record" }
      }
    }
  ],
  "outputs": []
}
</extracted_recipe>

<explanation>
- select_rows uses data binding to reference fetch_users result
- form uses defaults binding to pre-fill with selected user's data (name, email auto-populated)
- code step combines: select_user result + get_updates result to build SQL
- Input step results always have structure: { responses: { <field_key>: { selectedRows|values|answers: ... } } }
</explanation>

---

### Example 5: Template Binding for Markdown Output

<conversation_example>
User: Give me a summary report for user 456
Tool Call: get_user_stats { user_id: "456" }
Tool Result: { name: "John", orders: 15, total_spent: 1250.00, member_since: "2024-01-15" }
Assistant: ## John's Summary
- Orders: 15
- Total Spent: $1,250.00
</conversation_example>

<extracted_recipe>
{
  "name": "User Summary Report",
  "description": "Generate a formatted summary report for a user",
  "inputs": [
    { "key": "user_id", "label": "User ID", "type": "string", "required": true }
  ],
  "steps": [
    {
      "stepKey": "fetch_stats",
      "label": "Fetch user statistics",
      "toolName": "get_user_stats",
      "params": {
        "user_id": { "type": "input", "inputKey": "user_id" }
      }
    },
    {
      "stepKey": "display_report",
      "label": "Display summary report",
      "toolName": "output_markdown",
      "params": {
        "content": {
          "type": "template",
          "template": "## {{name}}'s Summary\\n\\n| Metric | Value |\\n|--------|-------|\\n| Orders | {{orders}} |\\n| Total Spent | ${"$"}{{totalSpent}} |\\n| Member Since | {{memberSince}} |",
          "variables": {
            "name": { "type": "step", "stepKey": "fetch_stats", "path": "$.name" },
            "orders": { "type": "step", "stepKey": "fetch_stats", "path": "$.orders" },
            "totalSpent": { "type": "step", "stepKey": "fetch_stats", "path": "$.total_spent" },
            "memberSince": { "type": "step", "stepKey": "fetch_stats", "path": "$.member_since" }
          }
        }
      }
    }
  ],
  "outputs": [{ "stepId": "display_report", "kind": "markdown" }]
}
</extracted_recipe>

<explanation>
- Template binding for complex string with multiple dynamic values
- Each variable uses step binding with specific path to extract field
- Displays ALL data from tool result, not just what assistant showed
</explanation>
</examples>

<common_mistakes>
## Common Mistakes to Avoid

### Mistake 1: Using static for dynamic data
[BAD] \`"customer_id": { "type": "static", "value": "ABC123" }\`
[GOOD] \`"customer_id": { "type": "input", "inputKey": "customer_id" }\`

### Mistake 2: Hardcoding tool results
[BAD] \`"data": { "type": "static", "value": [{"id": 1}, {"id": 2}] }\`
[GOOD] \`"data": { "type": "step", "stepKey": "fetch_data" }\`

### Mistake 3: Forgetting to define inputs
[BAD] Using \`{ "type": "input", "inputKey": "foo" }\` without defining "foo" in inputs array
[GOOD] Always define input in "inputs" array before referencing

### Mistake 4: Referencing future steps
[BAD] Step at index 0 referencing step at index 2
[GOOD] Only reference steps that come BEFORE current step

### Mistake 5: code_execute with non-object input
[BAD] \`"input": { "type": "step", "stepKey": "items" }\` (if items is array)
[GOOD] \`"input": { "type": "object", "entries": { "items": { "type": "step", ... } } }\`

### Mistake 6: Including exploration steps
[BAD] Including debugging queries that were only used to understand the data
[GOOD] Only include steps that contribute to the final output

### Mistake 7: Not using ALL returned fields in output
[BAD] output_table with only 2 columns when tool returns 5 fields
[GOOD] Include all relevant fields the tool returns
</common_mistakes>

<output_format>
## Output Format

Call the submit_recipe tool with this structure:

\`\`\`json
{
  "name": "Recipe name (concise, describes the workflow)",
  "description": "What this recipe accomplishes",
  "inputs": [
    {
      "key": "snake_case_key",
      "label": "Human Readable Label",
      "type": "string" | "number",
      "description": "What this input is for",
      "required": true | false,
      "defaultValue": "optional default"
    }
  ],
  "steps": [
    {
      "stepKey": "snake_case_step_key",
      "label": "Human readable step description",
      "toolName": "tool_name",
      "params": {
        "param_name": <ParamBinding>
      }
    }
  ],
  "outputs": [
    {
      "stepId": "output_step_key",
      "kind": "table" | "chart" | "markdown" | "key_value"
    }
  ]
}
\`\`\`

### Naming Guidelines
- **stepKey**: snake_case, descriptive (fetch_orders, calculate_total, display_chart)
- **label**: Human readable, present tense (Fetch customer orders, Calculate totals)
- **Recipe name**: Short, action-oriented (Customer Orders Report, Revenue Analysis)
</output_format>`

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
