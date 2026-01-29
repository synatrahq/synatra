import { UserTable } from "./user.sql"
import { SessionTable, AccountTable, VerificationTable } from "./session.sql"
import { OrganizationTable } from "./organization.sql"
import { MemberTable } from "./member.sql"
import { InvitationTable } from "./invitation.sql"
import { AgentTable } from "./agent.sql"
import { EnvironmentTable } from "./environment.sql"
import { ResourceTable, ResourceConfigTable } from "./resource.sql"
import { ConnectorTable, ConnectorStatus } from "./connector.sql"
import { ChannelTable } from "./channel.sql"
import { ChannelMemberTable } from "./channel-member.sql"
import { ChannelAgentTable } from "./channel-agent.sql"
import { TriggerTable, TriggerReleaseTable, TriggerWorkingCopyTable, TriggerEnvironmentTable } from "./trigger.sql"
import { PromptTable } from "./prompt.sql"
import { ThreadTable } from "./thread.sql"
import { MessageTable } from "./message.sql"
import { AppAccountTable } from "./app-account.sql"
import {
  AgentCopilotSessionTable,
  AgentCopilotThreadTable,
  AgentCopilotMessageTable,
  AgentCopilotProposalTable,
  AgentCopilotToolLogTable,
  AgentCopilotResourceRequestTable,
} from "./agent-copilot.sql"
import { AgentTemplateTable } from "./agent-template.sql"
import { RunTable } from "./run.sql"
import { OutputItemTable } from "./output-item.sql"
import { HumanRequestTable, HumanResponseTable } from "./human-request.sql"
import { UsageMonthTable } from "./usage.sql"
import { SubscriptionTable } from "./subscription.sql"
import { StripeEventTable } from "./stripe-event.sql"
import {
  RecipeTable,
  RecipeReleaseTable,
  RecipeWorkingCopyTable,
  RecipeStepTable,
  RecipeEdgeTable,
  RecipeExecutionTable,
  RecipeExecutionEventTable,
} from "./recipe.sql"

import { MemberRole } from "../types"
import { InvitationStatus } from "../types"
import { ResourceType, ConnectionMode } from "../types"
import { ChannelIconColors } from "../types"
import { ChannelMemberRole } from "../types"
import { TriggerType } from "../types"
import { ThreadKind, ThreadStatus, RunStatus } from "../types"
import { MessageType } from "../types"
import { AppId } from "../types"
import { OutputKind } from "../types"
import { HumanRequestKind, HumanRequestStatus, HumanResponseStatus } from "../types"
import { LlmProvider } from "../types"
import { RecipeExecutionStatus, RecipeStepType, RecipeExecutionEventType } from "../types"

export * from "./user.sql"
export * from "./session.sql"
export * from "./organization.sql"
export * from "./member.sql"
export * from "./invitation.sql"
export * from "./agent.sql"
export * from "./environment.sql"
export * from "./resource.sql"
export * from "./connector.sql"
export * from "./channel.sql"
export * from "./channel-member.sql"
export * from "./channel-agent.sql"
export * from "./trigger.sql"
export * from "./prompt.sql"
export * from "./thread.sql"
export * from "./message.sql"
export * from "./app-account.sql"
export * from "./agent-copilot.sql"
export * from "./agent-template.sql"
export * from "./run.sql"
export * from "./output-item.sql"
export * from "./human-request.sql"
export * from "./usage.sql"
export * from "./subscription.sql"
export * from "./stripe-event.sql"
export * from "./recipe.sql"

export const schema = {
  user: UserTable,
  session: SessionTable,
  account: AccountTable,
  verification: VerificationTable,
  organization: OrganizationTable,
  member: MemberTable,
  MemberRole,
  invitation: InvitationTable,
  InvitationStatus,
  agent: AgentTable,
  channel: ChannelTable,
  ChannelIconColors,
  channelMember: ChannelMemberTable,
  ChannelMemberRole,
  channelAgent: ChannelAgentTable,
  trigger: TriggerTable,
  triggerRelease: TriggerReleaseTable,
  triggerWorkingCopy: TriggerWorkingCopyTable,
  triggerEnvironment: TriggerEnvironmentTable,
  TriggerType,
  prompt: PromptTable,
  environment: EnvironmentTable,
  resource: ResourceTable,
  resourceConfig: ResourceConfigTable,
  ResourceType,
  ConnectionMode,
  connector: ConnectorTable,
  ConnectorStatus,
  thread: ThreadTable,
  ThreadKind,
  ThreadStatus,
  message: MessageTable,
  MessageType,
  appAccount: AppAccountTable,
  AppId,
  agentCopilotSession: AgentCopilotSessionTable,
  agentCopilotThread: AgentCopilotThreadTable,
  agentCopilotMessage: AgentCopilotMessageTable,
  agentCopilotProposal: AgentCopilotProposalTable,
  agentCopilotToolLog: AgentCopilotToolLogTable,
  agentCopilotResourceRequest: AgentCopilotResourceRequestTable,
  agentTemplate: AgentTemplateTable,
  run: RunTable,
  RunStatus,
  outputItem: OutputItemTable,
  OutputKind,
  humanRequest: HumanRequestTable,
  humanResponse: HumanResponseTable,
  HumanRequestKind,
  HumanRequestStatus,
  HumanResponseStatus,
  LlmProvider,
  usageMonth: UsageMonthTable,
  subscription: SubscriptionTable,
  stripeEvent: StripeEventTable,
  recipe: RecipeTable,
  recipeRelease: RecipeReleaseTable,
  recipeWorkingCopy: RecipeWorkingCopyTable,
  recipeStep: RecipeStepTable,
  recipeEdge: RecipeEdgeTable,
  recipeExecution: RecipeExecutionTable,
  recipeExecutionEvent: RecipeExecutionEventTable,
  RecipeExecutionStatus,
  RecipeStepType,
  RecipeExecutionEventType,
}
