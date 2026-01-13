import { createSignal, createEffect, Show, For } from "solid-js"
import type { AgentTool, TypeDef, ResourceType } from "@synatra/core/types"
import {
  Modal,
  ModalContainer,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Spinner,
  Select,
  Checkbox,
  type SelectOption,
} from "../../../ui"
import { ResourceIcon } from "../../../components"
import { Database, MagnifyingGlass, Table } from "phosphor-solid-js"
import { api } from "../../../app"
import { stableId } from "./utils"

type GenerateToolsModalProps = {
  open: boolean
  onClose: () => void
  onGenerate: (tools: AgentTool[], types: Record<string, TypeDef>) => void
}

type Step = "select-resource" | "select-table" | "confirm"

type Resource = {
  id: string
  name: string
  slug: string
  type: ResourceType
  configs: { environmentId: string; environmentName: string }[]
}

type TableInfo = {
  schema: string
  name: string
  type: "table" | "view"
}

type ColumnInfo = {
  name: string
  type: string
  nullable: boolean
  isPrimaryKey: boolean
  isUnique: boolean
  isAutoIncrement: boolean
  defaultValue: string | null
  comment: string | null
  maxLength: number | null
  numericPrecision: number | null
  numericScale: number | null
  foreignKey: { table: string; column: string } | null
}

function pascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("")
}

function pluralize(word: string): string {
  if (word.endsWith("s") || word.endsWith("x") || word.endsWith("ch") || word.endsWith("sh")) {
    return word + "es"
  }
  if (word.endsWith("y") && !/[aeiou]y$/i.test(word)) {
    return word.slice(0, -1) + "ies"
  }
  return word + "s"
}

function sqlTypeToSchemaType(sqlType: string): string {
  const type = sqlType.toLowerCase()
  if (type.includes("int") || type.includes("serial")) return "number"
  if (type.includes("bool")) return "boolean"
  if (type.includes("json")) return "object"
  if (type.includes("array")) return "array"
  return "string"
}

function formatType(col: ColumnInfo): string {
  if (col.maxLength) return `${col.type}(${col.maxLength})`
  if (col.numericPrecision && col.numericScale) return `${col.type}(${col.numericPrecision},${col.numericScale})`
  if (col.numericPrecision) return `${col.type}(${col.numericPrecision})`
  return col.type
}

function buildColumnDescription(col: ColumnInfo): string {
  if (col.comment) return col.comment

  const meta: string[] = []
  meta.push(formatType(col))
  if (col.foreignKey) meta.push(`references ${col.foreignKey.table}.${col.foreignKey.column}`)
  if (col.isPrimaryKey) meta.push("primary key")
  if (col.isUnique && !col.isPrimaryKey) meta.push("unique")
  if (col.isAutoIncrement) meta.push("auto increment")
  if (!col.nullable) meta.push("required")
  if (col.defaultValue && !col.isAutoIncrement) meta.push(`default: ${col.defaultValue}`)

  return meta.join(", ")
}

function quoteIdentifier(name: string, dbType: "postgres" | "mysql"): string {
  if (dbType === "postgres") return `"${name}"`
  return `\`${name}\``
}

function buildFullTableName(tableName: string, schema: string, dbType: "postgres" | "mysql"): string {
  const q = (name: string) => quoteIdentifier(name, dbType)
  if (dbType === "postgres" && schema && schema !== "public") {
    return `${q(schema)}.${q(tableName)}`
  }
  if (dbType === "mysql" && schema) {
    return `${q(schema)}.${q(tableName)}`
  }
  return q(tableName)
}

function generateToolsFromTable(
  tableName: string,
  schema: string,
  columns: ColumnInfo[],
  resourceSlug: string,
  dbType: "postgres" | "mysql",
): { tools: AgentTool[]; types: Record<string, TypeDef> } {
  const pkColumn = columns.find((c) => c.isPrimaryKey)
  const primaryKey = pkColumn?.name ?? "id"
  const pkType = pkColumn?.type ?? "string"
  const pkDescription = pkColumn ? buildColumnDescription(pkColumn) : `${primaryKey} of the ${tableName}`
  const mutableColumns = columns.filter((c) => !c.isPrimaryKey)
  const fullTableName = buildFullTableName(tableName, schema, dbType)
  const q = (name: string) => quoteIdentifier(name, dbType)

  const typeName = pascalCase(tableName)
  const pluralTypeName = pluralize(typeName)
  const inputTypeName = `${typeName}Input`

  const types: Record<string, TypeDef> = {
    [typeName]: {
      type: "object",
      properties: Object.fromEntries(
        columns.map((c) => [c.name, { type: sqlTypeToSchemaType(c.type), description: buildColumnDescription(c) }]),
      ),
      required: columns.filter((c) => !c.nullable).map((c) => c.name),
    },
    [inputTypeName]: {
      type: "object",
      properties: Object.fromEntries(
        mutableColumns.map((c) => [
          c.name,
          { type: sqlTypeToSchemaType(c.type), description: buildColumnDescription(c) },
        ]),
      ),
      required: mutableColumns.filter((c) => !c.nullable && !c.defaultValue).map((c) => c.name),
    },
  }

  const rowRef = { $ref: `#/$defs/${typeName}` }
  const inputRef = { $ref: `#/$defs/${inputTypeName}` }

  const createColumns = mutableColumns.map((c) => q(c.name))
  const createPlaceholders = mutableColumns.map((_, i) => `$${i + 1}`)
  const updateSetClauses = mutableColumns.map((c, i) => `${q(c.name)} = $${i + 1}`)

  const tools: AgentTool[] = [
    {
      stableId: stableId(),
      name: `get${typeName}ById`,
      description: `Get a ${tableName} by ${primaryKey}`,
      params: {
        type: "object",
        properties: { [primaryKey]: { type: sqlTypeToSchemaType(pkType), description: pkDescription } },
        required: [primaryKey],
      },
      returns: rowRef,
      code: `const [row] = await context.resources["${resourceSlug}"].query(
  'SELECT * FROM ${fullTableName} WHERE ${q(primaryKey)} = $1',
  [params.${primaryKey}]
)
return row`,
    },
    {
      stableId: stableId(),
      name: `create${typeName}`,
      description: `Create a new ${tableName}`,
      requiresReview: true,
      params: inputRef,
      returns: rowRef,
      code: `const [row] = await context.resources["${resourceSlug}"].query(
  'INSERT INTO ${fullTableName} (${createColumns.join(", ")}) VALUES (${createPlaceholders.join(", ")}) RETURNING *',
  [${mutableColumns.map((c) => `params.${c.name}`).join(", ")}]
)
return row`,
    },
    {
      stableId: stableId(),
      name: `update${typeName}`,
      description: `Update a ${tableName} by ${primaryKey}`,
      requiresReview: true,
      params: {
        allOf: [
          {
            type: "object",
            properties: { [primaryKey]: { type: sqlTypeToSchemaType(pkType), description: pkDescription } },
            required: [primaryKey],
          },
          inputRef,
        ],
      },
      returns: rowRef,
      code: `const [row] = await context.resources["${resourceSlug}"].query(
  'UPDATE ${fullTableName} SET ${updateSetClauses.join(", ")} WHERE ${q(primaryKey)} = $${mutableColumns.length + 1} RETURNING *',
  [${mutableColumns.map((c) => `params.${c.name}`).join(", ")}, params.${primaryKey}]
)
return row`,
    },
    {
      stableId: stableId(),
      name: `delete${typeName}`,
      description: `Delete a ${tableName} by ${primaryKey}`,
      requiresReview: true,
      params: {
        type: "object",
        properties: { [primaryKey]: { type: sqlTypeToSchemaType(pkType), description: pkDescription } },
        required: [primaryKey],
      },
      returns: {
        type: "object",
        properties: { deleted: { type: "boolean", description: "Whether the record was deleted" } },
      },
      code: `await context.resources["${resourceSlug}"].query(
  'DELETE FROM ${fullTableName} WHERE ${q(primaryKey)} = $1',
  [params.${primaryKey}]
)
return { deleted: true }`,
    },
    {
      stableId: stableId(),
      name: `list${pluralTypeName}`,
      description: `List ${tableName} records`,
      params: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Maximum number of records to return" },
          offset: { type: "number", description: "Number of records to skip" },
        },
      },
      returns: { type: "array", items: rowRef },
      code: `const limit = params.limit ?? 100
const offset = params.offset ?? 0
return await context.resources["${resourceSlug}"].query(
  'SELECT * FROM ${fullTableName} LIMIT $1 OFFSET $2',
  [limit, offset]
)`,
    },
    {
      stableId: stableId(),
      name: `count${pluralTypeName}`,
      description: `Count ${tableName} records`,
      params: {},
      returns: {
        type: "object",
        properties: { count: { type: "number", description: `Total number of ${tableName} records` } },
      },
      code: `const [row] = await context.resources["${resourceSlug}"].query(
  'SELECT COUNT(*) as count FROM ${fullTableName}',
  []
)
return { count: Number(row.count) }`,
    },
  ]

  return { tools, types }
}

type GitHubToolCategory = "issues" | "pullRequests" | "repositories" | "files"

type GitHubToolTemplate = {
  category: GitHubToolCategory
  name: string
  description: string
  params: AgentTool["params"]
  returns: AgentTool["returns"]
  code: string
  requiresReview?: boolean
}

const GITHUB_TOOL_CATEGORIES: { id: GitHubToolCategory; label: string; description: string }[] = [
  { id: "issues", label: "Issues", description: "Create, read, update issues and comments" },
  { id: "pullRequests", label: "Pull Requests", description: "List and read pull requests" },
  { id: "repositories", label: "Repositories", description: "List repositories and branches" },
  { id: "files", label: "Files", description: "Read files and directory contents" },
]

type IntercomToolCategory = "contacts" | "conversations" | "tags"

type IntercomToolTemplate = {
  category: IntercomToolCategory
  name: string
  description: string
  params: AgentTool["params"]
  returns: AgentTool["returns"]
  code: string
  requiresReview?: boolean
}

const INTERCOM_TOOL_CATEGORIES: { id: IntercomToolCategory; label: string; description: string }[] = [
  { id: "contacts", label: "Contacts", description: "Search, create, and update contacts" },
  { id: "conversations", label: "Conversations", description: "List, read, and reply to conversations" },
  { id: "tags", label: "Tags", description: "List and manage tags" },
]

function generateGitHubToolTemplates(resourceSlug: string): GitHubToolTemplate[] {
  const r = `context.resources["${resourceSlug}"]`
  return [
    {
      category: "issues",
      name: "listIssues",
      description: "List issues in a repository",
      params: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          state: { type: "string", description: "Filter by state: open, closed, all" },
        },
        required: ["owner", "repo"],
      },
      returns: { type: "array", items: { type: "object" } },
      code: `const query = params.state ? \`?state=\${params.state}\` : ""
return await ${r}.request("GET", \`/repos/\${params.owner}/\${params.repo}/issues\${query}\`)`,
    },
    {
      category: "issues",
      name: "getIssue",
      description: "Get a specific issue by number",
      params: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          issueNumber: { type: "number", description: "Issue number" },
        },
        required: ["owner", "repo", "issueNumber"],
      },
      returns: { type: "object" },
      code: `return await ${r}.request("GET", \`/repos/\${params.owner}/\${params.repo}/issues/\${params.issueNumber}\`)`,
    },
    {
      category: "issues",
      name: "createIssue",
      description: "Create a new issue",
      params: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          title: { type: "string", description: "Issue title" },
          body: { type: "string", description: "Issue body" },
        },
        required: ["owner", "repo", "title"],
      },
      returns: { type: "object" },
      requiresReview: true,
      code: `return await ${r}.request("POST", \`/repos/\${params.owner}/\${params.repo}/issues\`, { title: params.title, body: params.body })`,
    },
    {
      category: "issues",
      name: "addIssueComment",
      description: "Add a comment to an issue",
      params: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          issueNumber: { type: "number", description: "Issue number" },
          body: { type: "string", description: "Comment body" },
        },
        required: ["owner", "repo", "issueNumber", "body"],
      },
      returns: { type: "object" },
      requiresReview: true,
      code: `return await ${r}.request("POST", \`/repos/\${params.owner}/\${params.repo}/issues/\${params.issueNumber}/comments\`, { body: params.body })`,
    },
    {
      category: "pullRequests",
      name: "listPullRequests",
      description: "List pull requests in a repository",
      params: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          state: { type: "string", description: "Filter by state: open, closed, all" },
        },
        required: ["owner", "repo"],
      },
      returns: { type: "array", items: { type: "object" } },
      code: `const query = params.state ? \`?state=\${params.state}\` : ""
return await ${r}.request("GET", \`/repos/\${params.owner}/\${params.repo}/pulls\${query}\`)`,
    },
    {
      category: "pullRequests",
      name: "getPullRequest",
      description: "Get a specific pull request by number",
      params: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          pullNumber: { type: "number", description: "Pull request number" },
        },
        required: ["owner", "repo", "pullNumber"],
      },
      returns: { type: "object" },
      code: `return await ${r}.request("GET", \`/repos/\${params.owner}/\${params.repo}/pulls/\${params.pullNumber}\`)`,
    },
    {
      category: "pullRequests",
      name: "listPullRequestFiles",
      description: "List files changed in a pull request",
      params: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          pullNumber: { type: "number", description: "Pull request number" },
        },
        required: ["owner", "repo", "pullNumber"],
      },
      returns: { type: "array", items: { type: "object" } },
      code: `return await ${r}.request("GET", \`/repos/\${params.owner}/\${params.repo}/pulls/\${params.pullNumber}/files\`)`,
    },
    {
      category: "repositories",
      name: "listRepositories",
      description: "List repositories accessible to the GitHub App",
      params: {},
      returns: { type: "object" },
      code: `return await ${r}.request("GET", "/installation/repositories")`,
    },
    {
      category: "repositories",
      name: "getRepository",
      description: "Get repository information",
      params: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
        },
        required: ["owner", "repo"],
      },
      returns: { type: "object" },
      code: `return await ${r}.request("GET", \`/repos/\${params.owner}/\${params.repo}\`)`,
    },
    {
      category: "repositories",
      name: "listBranches",
      description: "List branches in a repository",
      params: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
        },
        required: ["owner", "repo"],
      },
      returns: { type: "array", items: { type: "object" } },
      code: `return await ${r}.request("GET", \`/repos/\${params.owner}/\${params.repo}/branches\`)`,
    },
    {
      category: "files",
      name: "getFileContent",
      description: "Get file contents from a repository",
      params: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          path: { type: "string", description: "File path" },
          ref: { type: "string", description: "Branch or commit SHA (optional)" },
        },
        required: ["owner", "repo", "path"],
      },
      returns: { type: "object" },
      code: `const query = params.ref ? \`?ref=\${params.ref}\` : ""
return await ${r}.request("GET", \`/repos/\${params.owner}/\${params.repo}/contents/\${params.path}\${query}\`)`,
    },
    {
      category: "files",
      name: "listDirectoryContents",
      description: "List files in a directory",
      params: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          path: { type: "string", description: "Directory path (optional, defaults to root)" },
        },
        required: ["owner", "repo"],
      },
      returns: { type: "array", items: { type: "object" } },
      code: `return await ${r}.request("GET", \`/repos/\${params.owner}/\${params.repo}/contents/\${params.path ?? ""}\`)`,
    },
  ]
}

function generateGitHubTools(
  resourceSlug: string,
  selectedCategories: Set<GitHubToolCategory>,
): { tools: AgentTool[]; types: Record<string, TypeDef> } {
  const templates = generateGitHubToolTemplates(resourceSlug)
  const tools: AgentTool[] = templates
    .filter((t) => selectedCategories.has(t.category))
    .map((t) => ({
      stableId: stableId(),
      name: t.name,
      description: t.description,
      params: t.params,
      returns: t.returns,
      code: t.code,
      requiresReview: t.requiresReview,
    }))
  return { tools, types: {} }
}

function generateIntercomToolTemplates(resourceSlug: string): IntercomToolTemplate[] {
  const r = `context.resources["${resourceSlug}"]`
  return [
    {
      category: "contacts",
      name: "searchContacts",
      description: "Search for contacts by email, name, or other attributes",
      params: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (email, name, etc.)" },
        },
        required: ["query"],
      },
      returns: { type: "object" },
      code: `return await ${r}.request("POST", "/contacts/search", {
  query: { field: "email", operator: "~", value: params.query }
})`,
    },
    {
      category: "contacts",
      name: "getContact",
      description: "Get a contact by ID",
      params: {
        type: "object",
        properties: {
          contactId: { type: "string", description: "Contact ID" },
        },
        required: ["contactId"],
      },
      returns: { type: "object" },
      code: `return await ${r}.request("GET", \`/contacts/\${params.contactId}\`)`,
    },
    {
      category: "contacts",
      name: "createContact",
      description: "Create a new contact",
      params: {
        type: "object",
        properties: {
          email: { type: "string", description: "Contact email" },
          name: { type: "string", description: "Contact name" },
          phone: { type: "string", description: "Contact phone number" },
        },
        required: ["email"],
      },
      returns: { type: "object" },
      requiresReview: true,
      code: `return await ${r}.request("POST", "/contacts", {
  role: "user",
  email: params.email,
  name: params.name,
  phone: params.phone
})`,
    },
    {
      category: "contacts",
      name: "updateContact",
      description: "Update a contact",
      params: {
        type: "object",
        properties: {
          contactId: { type: "string", description: "Contact ID" },
          email: { type: "string", description: "Contact email" },
          name: { type: "string", description: "Contact name" },
          phone: { type: "string", description: "Contact phone number" },
        },
        required: ["contactId"],
      },
      returns: { type: "object" },
      requiresReview: true,
      code: `const body = {}
if (params.email) body.email = params.email
if (params.name) body.name = params.name
if (params.phone) body.phone = params.phone
return await ${r}.request("PUT", \`/contacts/\${params.contactId}\`, body)`,
    },
    {
      category: "conversations",
      name: "listConversations",
      description: "List conversations",
      params: {
        type: "object",
        properties: {
          perPage: { type: "number", description: "Number of conversations per page (max 150)" },
          startingAfter: { type: "string", description: "Cursor for pagination" },
        },
      },
      returns: { type: "object" },
      code: `const query = []
if (params.perPage) query.push(\`per_page=\${params.perPage}\`)
if (params.startingAfter) query.push(\`starting_after=\${params.startingAfter}\`)
const qs = query.length > 0 ? \`?\${query.join("&")}\` : ""
return await ${r}.request("GET", \`/conversations\${qs}\`)`,
    },
    {
      category: "conversations",
      name: "getConversation",
      description: "Get a conversation by ID",
      params: {
        type: "object",
        properties: {
          conversationId: { type: "string", description: "Conversation ID" },
        },
        required: ["conversationId"],
      },
      returns: { type: "object" },
      code: `return await ${r}.request("GET", \`/conversations/\${params.conversationId}\`)`,
    },
    {
      category: "conversations",
      name: "replyToConversation",
      description: "Reply to a conversation",
      params: {
        type: "object",
        properties: {
          conversationId: { type: "string", description: "Conversation ID" },
          body: { type: "string", description: "Reply message body" },
          messageType: { type: "string", description: "Message type: comment or note" },
          adminId: { type: "string", description: "Admin ID sending the reply" },
        },
        required: ["conversationId", "body", "adminId"],
      },
      returns: { type: "object" },
      requiresReview: true,
      code: `return await ${r}.request("POST", \`/conversations/\${params.conversationId}/reply\`, {
  message_type: params.messageType ?? "comment",
  type: "admin",
  admin_id: params.adminId,
  body: params.body
})`,
    },
    {
      category: "conversations",
      name: "closeConversation",
      description: "Close a conversation",
      params: {
        type: "object",
        properties: {
          conversationId: { type: "string", description: "Conversation ID" },
          adminId: { type: "string", description: "Admin ID closing the conversation" },
        },
        required: ["conversationId", "adminId"],
      },
      returns: { type: "object" },
      requiresReview: true,
      code: `return await ${r}.request("POST", \`/conversations/\${params.conversationId}/parts\`, {
  message_type: "close",
  type: "admin",
  admin_id: params.adminId
})`,
    },
    {
      category: "tags",
      name: "listTags",
      description: "List all tags",
      params: {},
      returns: { type: "object" },
      code: `return await ${r}.request("GET", "/tags")`,
    },
    {
      category: "tags",
      name: "tagContact",
      description: "Add a tag to a contact",
      params: {
        type: "object",
        properties: {
          contactId: { type: "string", description: "Contact ID" },
          tagId: { type: "string", description: "Tag ID" },
        },
        required: ["contactId", "tagId"],
      },
      returns: { type: "object" },
      requiresReview: true,
      code: `return await ${r}.request("POST", \`/contacts/\${params.contactId}/tags\`, {
  id: params.tagId
})`,
    },
    {
      category: "tags",
      name: "untagContact",
      description: "Remove a tag from a contact",
      params: {
        type: "object",
        properties: {
          contactId: { type: "string", description: "Contact ID" },
          tagId: { type: "string", description: "Tag ID" },
        },
        required: ["contactId", "tagId"],
      },
      returns: { type: "object" },
      requiresReview: true,
      code: `return await ${r}.request("DELETE", \`/contacts/\${params.contactId}/tags/\${params.tagId}\`)`,
    },
  ]
}

function generateIntercomTools(
  resourceSlug: string,
  selectedCategories: Set<IntercomToolCategory>,
): { tools: AgentTool[]; types: Record<string, TypeDef> } {
  const templates = generateIntercomToolTemplates(resourceSlug)
  const tools: AgentTool[] = templates
    .filter((t) => selectedCategories.has(t.category))
    .map((t) => ({
      stableId: stableId(),
      name: t.name,
      description: t.description,
      params: t.params,
      returns: t.returns,
      code: t.code,
      requiresReview: t.requiresReview,
    }))
  return { tools, types: {} }
}

export function GenerateToolsModal(props: GenerateToolsModalProps) {
  const [step, setStep] = createSignal<Step>("select-resource")
  const [error, setError] = createSignal<string | null>(null)

  const [resources, setResources] = createSignal<Resource[]>([])
  const [selectedResource, setSelectedResource] = createSignal<Resource | null>(null)
  const [selectedEnvironmentId, setSelectedEnvironmentId] = createSignal<string | null>(null)
  const [tables, setTables] = createSignal<TableInfo[]>([])
  const [selectedTable, setSelectedTable] = createSignal<TableInfo | null>(null)
  const [columns, setColumns] = createSignal<ColumnInfo[]>([])
  const [tableSearch, setTableSearch] = createSignal("")
  const [loadingResources, setLoadingResources] = createSignal(false)
  const [loadingTables, setLoadingTables] = createSignal(false)
  const [loadingColumns, setLoadingColumns] = createSignal(false)

  const [generatedTools, setGeneratedTools] = createSignal<AgentTool[]>([])
  const [generatedTypes, setGeneratedTypes] = createSignal<Record<string, TypeDef>>({})
  const [selectedToolNames, setSelectedToolNames] = createSignal<Set<string>>(new Set())
  const [selectedGitHubCategories, setSelectedGitHubCategories] = createSignal<Set<GitHubToolCategory>>(new Set())
  const [selectedIntercomCategories, setSelectedIntercomCategories] = createSignal<Set<IntercomToolCategory>>(new Set())

  const supportedResources = () =>
    resources().filter(
      (r) => r.type === "postgres" || r.type === "mysql" || r.type === "github" || r.type === "intercom",
    )
  const isDatabase = () => {
    const type = selectedResource()?.type
    return type === "postgres" || type === "mysql"
  }
  const isGitHub = () => selectedResource()?.type === "github"
  const isIntercom = () => selectedResource()?.type === "intercom"

  const filteredTables = () => {
    const q = tableSearch().toLowerCase()
    if (!q) return tables()
    return tables().filter((t) => t.name.toLowerCase().includes(q) || t.schema.toLowerCase().includes(q))
  }

  const resourceOptions = (): SelectOption<string>[] =>
    supportedResources().map((r) => ({
      value: r.id,
      label: r.name,
      icon: (p) => <ResourceIcon type={r.type} class={p.class} />,
    }))

  const environmentOptions = (): SelectOption<string>[] =>
    selectedResource()?.configs.map((c) => ({
      value: c.environmentId,
      label: c.environmentName,
    })) ?? []

  createEffect(() => {
    if (props.open) {
      setStep("select-resource")
      setError(null)
      setSelectedResource(null)
      setSelectedEnvironmentId(null)
      setTables([])
      setSelectedTable(null)
      setColumns([])
      setTableSearch("")
      setGeneratedTools([])
      setGeneratedTypes({})
      setSelectedToolNames(new Set<string>())
      setSelectedGitHubCategories(new Set<GitHubToolCategory>())
      setSelectedIntercomCategories(new Set<IntercomToolCategory>())
      fetchResources()
    }
  })

  const fetchResources = async () => {
    setLoadingResources(true)
    try {
      const res = await api.api.resources.$get()
      if (res.ok) {
        const data = await res.json()
        setResources(
          data.map((r) => ({
            id: r.id,
            name: r.name,
            slug: r.slug,
            type: r.type as ResourceType,
            configs: r.configs.map((c) => ({
              environmentId: c.environmentId,
              environmentName: c.environmentName,
            })),
          })),
        )
      }
    } catch (e) {
      console.error("Failed to fetch resources", e)
    } finally {
      setLoadingResources(false)
    }
  }

  const fetchTables = async (resourceId: string, environmentId: string) => {
    setLoadingTables(true)
    setTables([])
    try {
      const res = await api.api.resources[":id"].tables.$get({
        param: { id: resourceId },
        query: { environmentId },
      })
      if (res.ok) {
        const data = await res.json()
        setTables(data as TableInfo[])
      }
    } catch (e) {
      console.error("Failed to fetch tables", e)
      setError("Failed to fetch tables from resource")
    } finally {
      setLoadingTables(false)
    }
  }

  const fetchColumns = async (resourceId: string, environmentId: string, table: string, schema?: string) => {
    setLoadingColumns(true)
    setColumns([])
    try {
      const res = await api.api.resources[":id"].columns.$get({
        param: { id: resourceId },
        query: { environmentId, table, schema },
      })
      if (res.ok) {
        const data = await res.json()
        setColumns(data as ColumnInfo[])
      }
    } catch (e) {
      console.error("Failed to fetch columns", e)
      setError("Failed to fetch table columns")
    } finally {
      setLoadingColumns(false)
    }
  }

  const handleResourceSelect = (resourceId: string) => {
    const resource = resources().find((r) => r.id === resourceId)
    setSelectedResource(resource ?? null)
    setSelectedEnvironmentId(null)
    setTables([])
    setSelectedTable(null)
    setSelectedGitHubCategories(new Set<GitHubToolCategory>())
    setSelectedIntercomCategories(new Set<IntercomToolCategory>())

    if (resource?.type === "github") {
      setSelectedGitHubCategories(new Set(GITHUB_TOOL_CATEGORIES.map((c) => c.id)))
      return
    }

    if (resource?.type === "intercom") {
      setSelectedIntercomCategories(new Set(INTERCOM_TOOL_CATEGORIES.map((c) => c.id)))
      return
    }

    if (resource?.configs.length === 1) {
      const envId = resource.configs[0].environmentId
      setSelectedEnvironmentId(envId)
      fetchTables(resourceId, envId)
    }
  }

  const handleEnvironmentSelect = (environmentId: string) => {
    setSelectedEnvironmentId(environmentId)
    const resource = selectedResource()
    if (resource) {
      fetchTables(resource.id, environmentId)
    }
  }

  const handleTableSelect = async (table: TableInfo) => {
    setSelectedTable(table)
    const resource = selectedResource()
    const envId = selectedEnvironmentId()
    if (resource && envId) {
      await fetchColumns(resource.id, envId, table.name, table.schema)
      setStep("confirm")
    }
  }

  createEffect(() => {
    const cols = columns()
    const table = selectedTable()
    const resource = selectedResource()
    if (cols.length > 0 && table && resource) {
      const dbType = resource.type as "postgres" | "mysql"
      const { tools, types } = generateToolsFromTable(table.name, table.schema, cols, resource.slug, dbType)
      setGeneratedTools(tools)
      setGeneratedTypes(types)
      setSelectedToolNames(new Set(tools.map((t) => t.name)))
    }
  })

  const selectedTools = () => generatedTools().filter((t) => selectedToolNames().has(t.name))

  const toggleTool = (name: string) => {
    const current = selectedToolNames()
    const next = new Set(current)
    if (next.has(name)) {
      next.delete(name)
    } else {
      next.add(name)
    }
    setSelectedToolNames(next)
  }

  const toggleGitHubCategory = (category: GitHubToolCategory) => {
    const current = selectedGitHubCategories()
    const next = new Set(current)
    if (next.has(category)) {
      next.delete(category)
    } else {
      next.add(category)
    }
    setSelectedGitHubCategories(next)
  }

  const toggleIntercomCategory = (category: IntercomToolCategory) => {
    const current = selectedIntercomCategories()
    const next = new Set(current)
    if (next.has(category)) {
      next.delete(category)
    } else {
      next.add(category)
    }
    setSelectedIntercomCategories(next)
  }

  const handleGenerateGitHub = () => {
    const resource = selectedResource()
    if (!resource) return
    const { tools, types } = generateGitHubTools(resource.slug, selectedGitHubCategories())
    props.onGenerate(tools, types)
    props.onClose()
  }

  const handleGenerateIntercom = () => {
    const resource = selectedResource()
    if (!resource) return
    const { tools, types } = generateIntercomTools(resource.slug, selectedIntercomCategories())
    props.onGenerate(tools, types)
    props.onClose()
  }

  const handleGenerate = () => {
    props.onGenerate(selectedTools(), generatedTypes())
    props.onClose()
  }

  const gitHubToolCount = () => {
    const categories = selectedGitHubCategories()
    const templates = generateGitHubToolTemplates(selectedResource()?.slug ?? "")
    return templates.filter((t) => categories.has(t.category)).length
  }

  const intercomToolCount = () => {
    const categories = selectedIntercomCategories()
    const templates = generateIntercomToolTemplates(selectedResource()?.slug ?? "")
    return templates.filter((t) => categories.has(t.category)).length
  }

  const handleBack = () => {
    if (step() === "confirm") {
      setStep("select-resource")
      setSelectedTable(null)
      setColumns([])
      setGeneratedTools([])
      setGeneratedTypes({})
    }
  }

  return (
    <Modal open={props.open} onBackdropClick={props.onClose} onEscape={props.onClose}>
      <ModalContainer size="lg">
        <ModalHeader
          title="Generate tools from resource"
          onClose={props.onClose}
          onBack={step() === "confirm" ? handleBack : undefined}
        />

        <Show when={step() === "select-resource"}>
          <ModalBody>
            <Show when={loadingResources()}>
              <div class="flex h-32 items-center justify-center">
                <Spinner size="sm" />
              </div>
            </Show>

            <Show when={!loadingResources() && supportedResources().length === 0}>
              <div class="flex h-32 flex-col items-center justify-center gap-2 text-center">
                <Database class="h-8 w-8 text-text-muted opacity-50" weight="regular" />
                <p class="text-xs text-text-muted">No supported resources connected</p>
                <p class="text-2xs text-text-muted">Add a PostgreSQL, MySQL, GitHub, or Intercom resource first</p>
              </div>
            </Show>

            <Show when={!loadingResources() && supportedResources().length > 0}>
              <div class="space-y-3">
                <div class="flex items-center gap-2">
                  <label class="w-20 shrink-0 text-xs text-text-muted">Resource</label>
                  <Select
                    value={selectedResource()?.id ?? ""}
                    options={resourceOptions()}
                    onChange={handleResourceSelect}
                    placeholder="Select a resource"
                    class="flex-1"
                  />
                </div>

                <Show when={isDatabase() && selectedResource()!.configs.length > 1}>
                  <div class="flex items-center gap-2">
                    <label class="w-20 shrink-0 text-xs text-text-muted">Environment</label>
                    <Select
                      value={selectedEnvironmentId() ?? ""}
                      options={environmentOptions()}
                      onChange={handleEnvironmentSelect}
                      placeholder="Select environment"
                      class="flex-1"
                    />
                  </div>
                </Show>

                <Show when={isDatabase() && selectedEnvironmentId()}>
                  <div class="flex flex-col gap-2">
                    <div class="flex items-center gap-2">
                      <label class="text-xs text-text-muted">Tables</label>
                      <Show when={loadingTables()}>
                        <Spinner size="xs" />
                      </Show>
                    </div>

                    <Show when={!loadingTables() && tables().length > 0}>
                      <div class="relative">
                        <MagnifyingGlass class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
                        <Input
                          type="text"
                          placeholder="Search tables..."
                          value={tableSearch()}
                          onInput={(e) => setTableSearch(e.currentTarget.value)}
                          class="h-7 pl-8 text-xs"
                        />
                      </div>

                      <div class="max-h-48 overflow-y-auto rounded-lg border border-border scrollbar-thin">
                        <For each={filteredTables()}>
                          {(table) => (
                            <button
                              type="button"
                              class="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-surface-muted"
                              onClick={() => handleTableSelect(table)}
                            >
                              <Table class="h-3.5 w-3.5 text-text-muted" />
                              <span class="text-xs text-text">{table.name}</span>
                              <Show when={table.schema !== "public"}>
                                <span class="text-[10px] text-text-muted">({table.schema})</span>
                              </Show>
                              <Show when={table.type === "view"}>
                                <span class="ml-auto rounded bg-surface-muted px-1.5 py-0.5 text-[10px] text-text-muted">
                                  view
                                </span>
                              </Show>
                            </button>
                          )}
                        </For>
                      </div>
                    </Show>

                    <Show when={!loadingTables() && tables().length === 0 && selectedEnvironmentId()}>
                      <div class="flex h-24 items-center justify-center rounded-lg border border-dashed border-border text-xs text-text-muted">
                        No tables found
                      </div>
                    </Show>
                  </div>
                </Show>

                <Show when={isGitHub()}>
                  <div class="flex flex-col gap-2">
                    <label class="text-xs text-text-muted">Select tool categories</label>
                    <div class="space-y-1 rounded-lg border border-border p-2">
                      <For each={GITHUB_TOOL_CATEGORIES}>
                        {(category) => (
                          <label class="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-surface-muted">
                            <Checkbox
                              checked={selectedGitHubCategories().has(category.id)}
                              onChange={() => toggleGitHubCategory(category.id)}
                            />
                            <div class="flex flex-col">
                              <span class="font-medium text-text">{category.label}</span>
                              <span class="text-2xs text-text-muted">{category.description}</span>
                            </div>
                          </label>
                        )}
                      </For>
                    </div>
                    <p class="text-2xs text-text-muted">{gitHubToolCount()} tools will be generated</p>
                  </div>
                </Show>

                <Show when={isIntercom()}>
                  <div class="flex flex-col gap-2">
                    <label class="text-xs text-text-muted">Select tool categories</label>
                    <div class="space-y-1 rounded-lg border border-border p-2">
                      <For each={INTERCOM_TOOL_CATEGORIES}>
                        {(category) => (
                          <label class="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-surface-muted">
                            <Checkbox
                              checked={selectedIntercomCategories().has(category.id)}
                              onChange={() => toggleIntercomCategory(category.id)}
                            />
                            <div class="flex flex-col">
                              <span class="font-medium text-text">{category.label}</span>
                              <span class="text-2xs text-text-muted">{category.description}</span>
                            </div>
                          </label>
                        )}
                      </For>
                    </div>
                    <p class="text-2xs text-text-muted">{intercomToolCount()} tools will be generated</p>
                  </div>
                </Show>
              </div>
            </Show>
          </ModalBody>

          <ModalFooter>
            <Button variant="ghost" size="sm" onClick={props.onClose}>
              Cancel
            </Button>
            <Show when={isGitHub() && selectedGitHubCategories().size > 0}>
              <Button variant="default" size="sm" onClick={handleGenerateGitHub}>
                Generate {gitHubToolCount()} tools
              </Button>
            </Show>
            <Show when={isIntercom() && selectedIntercomCategories().size > 0}>
              <Button variant="default" size="sm" onClick={handleGenerateIntercom}>
                Generate {intercomToolCount()} tools
              </Button>
            </Show>
          </ModalFooter>
        </Show>

        <Show when={step() === "confirm"}>
          <ModalBody>
            <Show when={loadingColumns()}>
              <div class="flex h-32 items-center justify-center">
                <Spinner size="sm" />
              </div>
            </Show>

            <Show when={!loadingColumns() && selectedTable()}>
              <div class="space-y-4">
                <div class="flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2">
                  <Table class="h-4 w-4 text-accent" />
                  <span class="text-xs font-medium text-accent">
                    {selectedTable()!.schema !== "public" ? `${selectedTable()!.schema}.` : ""}
                    {selectedTable()!.name}
                  </span>
                  <span class="text-2xs text-accent opacity-70">
                    {columns().length} columns
                    {columns().find((c) => c.isPrimaryKey) && ` · PK: ${columns().find((c) => c.isPrimaryKey)!.name}`}
                  </span>
                </div>

                <div class="space-y-2">
                  <span class="text-xs font-medium text-text">
                    Generated tools ({selectedToolNames().size}/{generatedTools().length})
                  </span>
                  <div class="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2 scrollbar-thin">
                    <For each={generatedTools()}>
                      {(tool) => (
                        <label class="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-surface-muted">
                          <Checkbox
                            checked={selectedToolNames().has(tool.name)}
                            onChange={() => toggleTool(tool.name)}
                          />
                          <span class="font-code text-text">{tool.name}()</span>
                          <span class="text-text-muted">-</span>
                          <span class="text-text-muted">{tool.description}</span>
                          <Show when={tool.requiresReview}>
                            <span class="ml-auto rounded bg-warning-soft px-1.5 py-0.5 text-[10px] text-warning">
                              review
                            </span>
                          </Show>
                        </label>
                      )}
                    </For>
                  </div>
                </div>

                <div class="space-y-2">
                  <span class="text-xs font-medium text-text">
                    Generated types ({Object.keys(generatedTypes()).length})
                  </span>
                  <div class="flex flex-wrap gap-1">
                    <For each={Object.keys(generatedTypes())}>
                      {(typeName) => (
                        <span class="rounded bg-surface-muted px-2 py-0.5 font-code text-xs text-text">{typeName}</span>
                      )}
                    </For>
                  </div>
                </div>

                <Show when={error()}>
                  <div class="rounded-md border border-danger bg-danger-soft px-2.5 py-1.5 text-2xs text-danger">
                    {error()}
                  </div>
                </Show>
              </div>
            </Show>
          </ModalBody>

          <ModalFooter>
            <Button variant="ghost" size="sm" onClick={props.onClose}>
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleGenerate}
              disabled={loadingColumns() || selectedTools().length === 0}
            >
              Generate {selectedTools().length} tools
            </Button>
          </ModalFooter>
        </Show>
      </ModalContainer>
    </Modal>
  )
}
