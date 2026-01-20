import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { getResourceById, principal } from "@synatra/core"
import { loadConfig, createResourceGateway, type TableInfo, type ColumnInfo } from "@synatra/service-call"
import { requirePermission } from "../../middleware/principal"
import { createError, toErrorMessage } from "@synatra/util/error"

export type { TableInfo, ColumnInfo }

const config = loadConfig("server")
const gateway = createResourceGateway(config)

const tablesParamsSchema = z.object({
  id: z.string(),
})

const tablesQuerySchema = z.object({
  environmentId: z.string(),
})

const columnsParamsSchema = z.object({
  id: z.string(),
})

const columnsQuerySchema = z.object({
  environmentId: z.string(),
  table: z.string(),
  schema: z.string().optional(),
})

export const introspection = new Hono()
  .get(
    "/:id/tables",
    requirePermission("resource", "read"),
    zValidator("param", tablesParamsSchema),
    zValidator("query", tablesQuerySchema),
    async (c) => {
      const { id } = c.req.valid("param")
      const { environmentId } = c.req.valid("query")
      const organizationId = principal.orgId()
      const resource = await getResourceById(id)
      if (resource.type !== "postgres" && resource.type !== "mysql") {
        throw createError("BadRequestError", { message: "Resource is not a database" })
      }
      const result = await gateway.tables(organizationId, id, environmentId)
      if (!result.ok) throw createError("InternalError", { message: toErrorMessage(result.error) })
      return c.json(result.data)
    },
  )
  .get(
    "/:id/columns",
    requirePermission("resource", "read"),
    zValidator("param", columnsParamsSchema),
    zValidator("query", columnsQuerySchema),
    async (c) => {
      const { id } = c.req.valid("param")
      const { environmentId, table, schema } = c.req.valid("query")
      const organizationId = principal.orgId()
      const resource = await getResourceById(id)
      if (resource.type !== "postgres" && resource.type !== "mysql") {
        throw createError("BadRequestError", { message: "Resource is not a database" })
      }
      const result = await gateway.columns(organizationId, id, environmentId, table, schema)
      if (!result.ok) throw createError("InternalError", { message: toErrorMessage(result.error) })
      return c.json(result.data)
    },
  )
