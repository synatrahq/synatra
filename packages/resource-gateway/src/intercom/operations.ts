import { z } from "zod"
import { intercomRequest } from "./auth"
import type { IntercomResource } from "../types"

export const intercomOperation = z.object({
  type: z.literal("intercom"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  endpoint: z
    .string()
    .refine((s) => s.startsWith("/") && !s.includes("@") && !s.includes("//"), "Invalid endpoint format"),
  body: z.unknown().optional(),
})

export type IntercomOperation = z.infer<typeof intercomOperation>

interface OperationResult {
  data: unknown
}

export async function executeIntercomOperation(
  resource: IntercomResource,
  operation: IntercomOperation,
): Promise<OperationResult> {
  const { config } = resource
  const { accessToken } = config

  const data = await intercomRequest(accessToken, operation.method, operation.endpoint, operation.body)

  return { data }
}
