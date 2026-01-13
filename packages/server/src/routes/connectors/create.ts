import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { CreateConnectorSchema, createConnector } from "@synatra/core"
import { requirePermission } from "../../middleware/principal"

export const create = new Hono().post(
  "/",
  requirePermission("connector", "create"),
  zValidator("json", CreateConnectorSchema),
  async (c) => {
    const body = c.req.valid("json")
    const result = await createConnector(body)
    return c.json(
      {
        connector: {
          id: result.connector.id,
          name: result.connector.name,
          status: result.connector.status,
          createdAt: result.connector.createdAt,
        },
        token: result.token,
      },
      201,
    )
  },
)
