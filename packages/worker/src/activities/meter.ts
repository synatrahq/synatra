import { principal, recordRunMeter as recordRunMeterCore } from "@synatra/core"

export interface RecordRunMeterInput {
  organizationId: string
  runId?: string
}

export async function recordRunMeter(input: RecordRunMeterInput): Promise<void> {
  await principal.withSystem({ organizationId: input.organizationId }, () => recordRunMeterCore({ runId: input.runId }))
}
