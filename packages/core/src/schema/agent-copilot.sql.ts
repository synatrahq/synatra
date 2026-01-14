import { index, pgTable, text, timestamp, uuid, jsonb, pgEnum, bigint, integer } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { AgentTable } from "./agent.sql"
import { UserTable } from "./user.sql"
import { OrganizationTable } from "./organization.sql"
import { ResourceTable } from "./resource.sql"
import { TriggerTable } from "./trigger.sql"
import type { AgentRuntimeConfig, CopilotToolCall, ResourceType, TriggerType, TriggerMode } from "../types"

export type CopilotInFlightState = {
  status: "idle" | "thinking" | "reasoning" | "tool_call" | "streaming"
  reasoningText: string
  streamingText: string
  toolCalls: {
    toolCallId: string
    toolName: string
    argsText: string
    status: "streaming" | "executing" | "completed"
  }[]
} | null

export const CopilotMessageRole = ["user", "assistant"] as const
export type CopilotMessageRoleType = (typeof CopilotMessageRole)[number]
export const copilotMessageRoleEnum = pgEnum("copilot_message_role", CopilotMessageRole)

export const CopilotProposalStatus = ["pending", "approved", "rejected"] as const
export type CopilotProposalStatusType = (typeof CopilotProposalStatus)[number]
export const copilotProposalStatusEnum = pgEnum("copilot_proposal_status", CopilotProposalStatus)

export const CopilotToolStatus = ["started", "succeeded", "failed"] as const
export type CopilotToolStatusType = (typeof CopilotToolStatus)[number]
export const copilotToolStatusEnum = pgEnum("copilot_tool_status", CopilotToolStatus)

export const CopilotResourceRequestStatus = ["pending", "completed", "cancelled"] as const
export type CopilotResourceRequestStatusType = (typeof CopilotResourceRequestStatus)[number]
export const copilotResourceRequestStatusEnum = pgEnum("copilot_resource_request_status", CopilotResourceRequestStatus)

export const CopilotQuestionRequestStatus = ["pending", "answered", "cancelled"] as const
export type CopilotQuestionRequestStatusType = (typeof CopilotQuestionRequestStatus)[number]
export const copilotQuestionRequestStatusEnum = pgEnum("copilot_question_request_status", CopilotQuestionRequestStatus)

export const CopilotTriggerRequestStatus = ["pending", "completed", "cancelled"] as const
export type CopilotTriggerRequestStatusType = (typeof CopilotTriggerRequestStatus)[number]
export const copilotTriggerRequestStatusEnum = pgEnum("copilot_trigger_request_status", CopilotTriggerRequestStatus)

export const CopilotTriggerRequestAction = ["create", "update"] as const
export type CopilotTriggerRequestActionType = (typeof CopilotTriggerRequestAction)[number]
export const copilotTriggerRequestActionEnum = pgEnum("copilot_trigger_request_action", CopilotTriggerRequestAction)

export const AgentCopilotThreadTable = pgTable(
  "agent_copilot_thread",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => OrganizationTable.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => AgentTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New Conversation"),
    seq: bigint("seq", { mode: "number" }).notNull().default(0),
    inFlightState: jsonb("in_flight_state").$type<CopilotInFlightState>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("agent_copilot_thread_agent_user_idx").on(table.agentId, table.userId, table.createdAt),
    index("agent_copilot_thread_org_agent_idx").on(table.organizationId, table.agentId, table.createdAt),
  ],
)

export const AgentCopilotMessageTable = pgTable(
  "agent_copilot_message",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => AgentCopilotThreadTable.id, { onDelete: "cascade" }),
    role: copilotMessageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    toolCalls: jsonb("tool_calls").$type<CopilotToolCall[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("agent_copilot_message_thread_idx").on(table.threadId, table.createdAt)],
)

export const AgentCopilotProposalTable = pgTable(
  "agent_copilot_proposal",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => AgentCopilotThreadTable.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => AgentCopilotMessageTable.id, { onDelete: "cascade" }),
    config: jsonb("config").$type<AgentRuntimeConfig>().notNull(),
    explanation: text("explanation").notNull(),
    status: copilotProposalStatusEnum("status").notNull().default("pending"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("agent_copilot_proposal_thread_idx").on(table.threadId, table.createdAt)],
)

export const AgentCopilotToolLogTable = pgTable(
  "agent_copilot_tool_log",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => AgentCopilotThreadTable.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => AgentCopilotMessageTable.id, { onDelete: "set null" }),
    toolName: text("tool_name").notNull(),
    toolCallId: text("tool_call_id"),
    status: copilotToolStatusEnum("status").notNull(),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("agent_copilot_tool_log_thread_idx").on(table.threadId, table.createdAt)],
)

export type CopilotResourceRequestSuggestion = {
  type: ResourceType
  reason: string
}

export type CopilotQuestionData = {
  question: string
  header: string
  options: { label: string; description: string }[]
  multiSelect: boolean
}

export type CopilotQuestionAnswer = {
  questionIndex: number
  selected: string[]
  otherText?: string
}

export const AgentCopilotResourceRequestTable = pgTable(
  "agent_copilot_resource_request",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => AgentCopilotThreadTable.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => AgentCopilotMessageTable.id, { onDelete: "cascade" }),
    explanation: text("explanation").notNull(),
    suggestions: jsonb("suggestions").$type<CopilotResourceRequestSuggestion[]>().notNull(),
    status: copilotResourceRequestStatusEnum("status").notNull().default("pending"),
    resourceId: uuid("resource_id").references(() => ResourceTable.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("agent_copilot_resource_request_thread_idx").on(table.threadId, table.status, table.createdAt)],
)

export const AgentCopilotQuestionRequestTable = pgTable(
  "agent_copilot_question_request",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => AgentCopilotThreadTable.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => AgentCopilotMessageTable.id, { onDelete: "cascade" }),
    toolCallId: text("tool_call_id").notNull(),
    questions: jsonb("questions").$type<CopilotQuestionData[]>().notNull(),
    answers: jsonb("answers").$type<CopilotQuestionAnswer[]>(),
    status: copilotQuestionRequestStatusEnum("status").notNull().default("pending"),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("agent_copilot_question_request_thread_idx").on(table.threadId, table.status, table.createdAt)],
)

export type CopilotTriggerConfig = {
  name?: string
  type?: TriggerType
  cron?: string | null
  timezone?: string
  template?: string
  script?: string
  mode?: TriggerMode
  appAccountId?: string | null
  appEvents?: string[] | null
}

export const AgentCopilotTriggerRequestTable = pgTable(
  "agent_copilot_trigger_request",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => AgentCopilotThreadTable.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => AgentCopilotMessageTable.id, { onDelete: "cascade" }),
    action: copilotTriggerRequestActionEnum("action").notNull(),
    triggerId: uuid("trigger_id").references(() => TriggerTable.id, { onDelete: "cascade" }),
    explanation: text("explanation").notNull(),
    config: jsonb("config").$type<CopilotTriggerConfig>().notNull(),
    status: copilotTriggerRequestStatusEnum("status").notNull().default("pending"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("agent_copilot_trigger_request_thread_idx").on(table.threadId, table.status, table.createdAt)],
)

export const AgentCopilotSessionTable = AgentCopilotThreadTable

export type AgentCopilotThread = typeof AgentCopilotThreadTable.$inferSelect
export type AgentCopilotMessage = typeof AgentCopilotMessageTable.$inferSelect
export type AgentCopilotProposal = typeof AgentCopilotProposalTable.$inferSelect
export type AgentCopilotToolLog = typeof AgentCopilotToolLogTable.$inferSelect
export type AgentCopilotResourceRequest = typeof AgentCopilotResourceRequestTable.$inferSelect
export type AgentCopilotQuestionRequest = typeof AgentCopilotQuestionRequestTable.$inferSelect
export type AgentCopilotTriggerRequest = typeof AgentCopilotTriggerRequestTable.$inferSelect
