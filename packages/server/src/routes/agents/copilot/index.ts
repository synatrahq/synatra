import { Hono } from "hono"
import { threads } from "./threads"
import { proposals } from "./proposals"
import { resourceRequests } from "./resource-requests"
import { triggerRequests } from "./trigger-requests"
import { messages } from "./threads/messages"
import { models } from "./models"
import { widgets } from "./widgets"

export const copilot = new Hono()
  .route("/", threads)
  .route("/", proposals)
  .route("/", resourceRequests)
  .route("/", triggerRequests)
  .route("/", messages)
  .route("/", models)
  .route("/", widgets)
