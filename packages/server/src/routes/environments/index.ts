import { Hono } from "hono"
import { list } from "./list"
import { get } from "./get"
import { create } from "./create"
import { update } from "./update"
import { del } from "./delete"

export const environments = new Hono()
  .route("/", list)
  .route("/", get)
  .route("/", create)
  .route("/", update)
  .route("/", del)
