import { Hono } from "hono"
import { list } from "./list"
import { get } from "./get"
import { create } from "./create"
import { update } from "./update"
import { del } from "./delete"
import { workingCopy } from "./working-copy"
import { releases } from "./releases"
import { channels } from "./channels"
import { copilot } from "./copilot"
import { playground } from "./playground"
import { templates } from "./templates"
import { prompts } from "./prompts"

export const agents = new Hono()
  .route("/", list)
  .route("/", create)
  .route("/templates", templates)
  .route("/", get)
  .route("/", update)
  .route("/", del)
  .route("/", workingCopy)
  .route("/", releases)
  .route("/", channels)
  .route("/", copilot)
  .route("/", playground)
  .route("/", prompts)
