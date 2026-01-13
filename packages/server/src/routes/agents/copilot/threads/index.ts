import { Hono } from "hono"
import { list } from "./list"
import { create } from "./create"
import { get } from "./get"
import { update } from "./update"
import { del } from "./delete"
import { stream } from "./stream"
import { logs } from "./logs"

export const threads = new Hono()
  .route("/", list)
  .route("/", create)
  .route("/", get)
  .route("/", update)
  .route("/", del)
  .route("/", stream)
  .route("/", logs)
