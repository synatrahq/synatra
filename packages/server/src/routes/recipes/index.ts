import { Hono } from "hono"
import { list } from "./list"
import { get } from "./get"
import { create } from "./create"
import { update } from "./update"
import { del } from "./delete"
import { execute } from "./execute"
import { pendingExecution } from "./pending-execution"
import { respond } from "./respond"
import { extract } from "./extract"
import { models } from "./models"
import { workingCopy } from "./working-copy"
import { releases } from "./releases"
import { deploy } from "./deploy"
import { channels } from "./channels"

export const recipes = new Hono()
  .route("/", list)
  .route("/", create)
  .route("/", extract)
  .route("/", models)
  .route("/", get)
  .route("/", update)
  .route("/", del)
  .route("/", workingCopy)
  .route("/", releases)
  .route("/", deploy)
  .route("/", execute)
  .route("/", pendingExecution)
  .route("/", respond)
  .route("/", channels)
