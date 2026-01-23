import { ScheduleOverlapPolicy } from "@temporalio/client"
import { threadWorkflow } from "@synatra/workflows"
import { getTemporalClient } from "../../temporal"
import { config } from "../../config"

export function getScheduleId(triggerEnvironmentId: string): string {
  return `schedule-${triggerEnvironmentId}`
}

type CreateScheduleParams = {
  scheduleId: string
  cron: string
  timezone: string
  triggerId: string
  triggerReleaseId: string | undefined
  agentId: string
  agentReleaseId: string | undefined
  agentVersionMode: "current" | "fixed"
  organizationId: string
  environmentId: string
  channelId: string
  subject: string
  payload: Record<string, unknown>
}

function formatCronWithTimezone(cron: string, timezone: string): string {
  return `CRON_TZ=${timezone} ${cron}`
}

export async function createSchedule(params: CreateScheduleParams) {
  const client = await getTemporalClient()
  await client.schedule.create({
    scheduleId: params.scheduleId,
    spec: { cronExpressions: [formatCronWithTimezone(params.cron, params.timezone)] },
    action: {
      type: "startWorkflow",
      workflowType: threadWorkflow,
      taskQueue: config().temporal.taskQueue,
      args: [
        {
          threadId: "",
          triggerId: params.triggerId,
          triggerReleaseId: params.triggerReleaseId,
          agentId: params.agentId,
          agentReleaseId: params.agentReleaseId,
          agentVersionMode: params.agentVersionMode,
          organizationId: params.organizationId,
          environmentId: params.environmentId,
          channelId: params.channelId,
          subject: params.subject,
          payload: params.payload,
        },
      ],
    },
    policies: { overlap: ScheduleOverlapPolicy.SKIP },
    state: { paused: false },
  })
}

type DeleteScheduleResult = {
  deleted: boolean
  notFound?: boolean
}

export async function deleteSchedule(scheduleId: string): Promise<DeleteScheduleResult> {
  const client = await getTemporalClient()
  try {
    await client.schedule.getHandle(scheduleId).delete()
    return { deleted: true }
  } catch (error) {
    const msg = error instanceof Error ? error.message : ""
    const isNotFound = msg.includes("not found") || msg.includes("NotFound")
    if (isNotFound) {
      return { deleted: false, notFound: true }
    }
    throw error
  }
}

export async function updateSchedule(scheduleId: string, params: CreateScheduleParams) {
  const client = await getTemporalClient()
  const handle = client.schedule.getHandle(scheduleId)
  await handle.update((prev) => ({
    ...prev,
    spec: { cronExpressions: [formatCronWithTimezone(params.cron, params.timezone)] },
    action: {
      type: "startWorkflow" as const,
      workflowType: threadWorkflow,
      taskQueue: config().temporal.taskQueue,
      args: [
        {
          threadId: "",
          triggerId: params.triggerId,
          triggerReleaseId: params.triggerReleaseId,
          agentId: params.agentId,
          agentReleaseId: params.agentReleaseId,
          agentVersionMode: params.agentVersionMode,
          organizationId: params.organizationId,
          environmentId: params.environmentId,
          channelId: params.channelId,
          subject: params.subject,
          payload: params.payload,
        },
      ],
    },
    policies: { overlap: ScheduleOverlapPolicy.SKIP },
  }))
}
