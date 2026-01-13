import { Hono } from "hono"
import { list } from "./list"
import { get } from "./get"
import { create } from "./create"
import { update } from "./update"
import { remove } from "./delete"
import { toggle } from "./toggle"
import { regenerateSecret } from "./regenerate-secret"
import { run } from "./run"
import { workingCopy } from "./working-copy"
import { releases } from "./releases"
import { environments } from "./environments"

export const triggers = new Hono()
  .route("/", list)
  .route("/", get)
  .route("/", create)
  .route("/", update)
  .route("/", remove)
  .route("/", toggle)
  .route("/", regenerateSecret)
  .route("/", run)
  .route("/", workingCopy)
  .route("/", releases)
  .route("/", environments)
