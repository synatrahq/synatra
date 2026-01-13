import { Hono } from "hono"
import { list } from "./list"
import { get } from "./get"
import { getManaged } from "./get-managed"
import { create } from "./create"
import { update } from "./update"
import { del } from "./delete"
import { config } from "./config"
import { testConnection } from "./test-connection"
import { introspection } from "./introspection"
import { validateLlmKey } from "./validate-llm-key"

export const resources = new Hono()
  .route("/", list)
  .route("/", create)
  .route("/", testConnection)
  .route("/", validateLlmKey)
  .route("/", getManaged)
  .route("/", get)
  .route("/", update)
  .route("/", del)
  .route("/", config)
  .route("/", introspection)
