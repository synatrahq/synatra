import { Hono } from "hono"
import { session } from "./session"
import { messages } from "./messages"
import { stream } from "./stream"
import { approvals } from "./approvals"
import { executeTool } from "./execute-tool"
import { humanRequests } from "./human-requests"

export const playground = new Hono()
  .route("/", session)
  .route("/", messages)
  .route("/", stream)
  .route("/", approvals)
  .route("/", executeTool)
  .route("/", humanRequests)
