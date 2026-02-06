type LimitCheckResult = {
  allowed: boolean
  current: number
  limit: number | null
  message: string
}

export function checkAgentLimit(_currentCount: number, _plan: unknown): LimitCheckResult {
  return { allowed: true, current: 0, limit: null, message: "" }
}

export function checkUserLimit(_currentCount: number, _additionalCount: number, _plan: unknown): LimitCheckResult {
  return { allowed: true, current: 0, limit: null, message: "" }
}
