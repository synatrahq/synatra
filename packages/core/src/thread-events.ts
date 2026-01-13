import { z } from "zod"

export const threadStreamEventSchemas = {
  "message.created": z.object({
    message: z.looseObject({ id: z.string(), threadId: z.string() }),
  }),
  "thread.status_changed": z.object({
    status: z.string(),
    result: z.unknown().optional(),
    error: z.string().nullable().optional(),
    updatedAt: z.string().optional(),
  }),
  "run.created": z.object({
    run: z.looseObject({ id: z.string(), threadId: z.string() }),
  }),
  "run.updated": z.object({
    run: z.looseObject({ id: z.string(), threadId: z.string() }),
  }),
  "run.completed": z.object({
    run: z.looseObject({ id: z.string(), threadId: z.string() }),
  }),
  "run.failed": z.object({
    run: z.looseObject({ id: z.string(), threadId: z.string() }),
  }),
  "run.cancelled": z.object({
    run: z.looseObject({ id: z.string(), threadId: z.string() }),
  }),
  "run.rejected": z.object({
    run: z.looseObject({ id: z.string(), threadId: z.string() }),
  }),
  "output_item.created": z.object({
    outputItem: z.looseObject({ id: z.string(), threadId: z.string() }),
  }),
  "human_request.created": z.object({
    humanRequest: z.looseObject({ id: z.string(), threadId: z.string() }),
  }),
  "human_request.resolved": z.object({
    humanRequest: z.looseObject({ id: z.string(), threadId: z.string() }),
    response: z.looseObject({ id: z.string(), requestId: z.string() }),
  }),
  resync_required: z.looseObject({}),
  ping: z.looseObject({}),
  init: z.unknown(),
} as const

export type ThreadStreamEventType = keyof typeof threadStreamEventSchemas
