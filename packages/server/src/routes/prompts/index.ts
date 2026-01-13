import { Hono } from "hono"
import { list } from "./list"
import { get } from "./get"
import { create } from "./create"
import { update } from "./update"
import { del } from "./delete"
import { releases } from "./releases"
import { workingCopy } from "./working-copy"

export const prompts = new Hono()
  .route("/", list)
  .route("/", get)
  .route("/", create)
  .route("/", update)
  .route("/", del)
  .route("/", releases)
  .route("/", workingCopy)
