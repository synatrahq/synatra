import type { AgentTool, ApprovalAuthority } from "@synatra/core/types"

export interface EvaluateToolRulesInput {
  tool: AgentTool
}

export interface EvaluateToolRulesResult {
  requiresReview: boolean
  approvalAuthority: ApprovalAuthority
  selfApproval: boolean
  approvalTimeoutMs: number
}

const DEFAULT_APPROVAL_TIMEOUT_MS = 259200000
const MIN_APPROVAL_TIMEOUT_MS = 60000
const MAX_APPROVAL_TIMEOUT_MS = 31536000000

export async function evaluateToolRules(input: EvaluateToolRulesInput): Promise<EvaluateToolRulesResult> {
  const { tool } = input
  const timeout = tool.approvalTimeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS
  const clampedTimeout = Math.max(MIN_APPROVAL_TIMEOUT_MS, Math.min(timeout, MAX_APPROVAL_TIMEOUT_MS))

  return {
    requiresReview: tool.requiresReview ?? false,
    approvalAuthority: tool.approvalAuthority ?? "any_member",
    selfApproval: tool.selfApproval ?? true,
    approvalTimeoutMs: clampedTimeout,
  }
}
