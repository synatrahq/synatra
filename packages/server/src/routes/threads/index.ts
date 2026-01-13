import { Hono } from "hono"
import { list } from "./list"
import { counts } from "./counts"
import { get } from "./get"
import { create } from "./create"
import { respondHumanRequest } from "./respond-human-request"
import { cancel } from "./cancel"
import { reply } from "./reply"
import { stream } from "./stream"
import { remove } from "./remove"
import { archive } from "./archive"
import { unarchive } from "./unarchive"

export const threads = new Hono()
  .route("/", list)
  .route("/", counts)
  .route("/", get)
  .route("/", create)
  .route("/", respondHumanRequest)
  .route("/", cancel)
  .route("/", reply)
  .route("/", stream)
  .route("/", remove)
  .route("/", archive)
  .route("/", unarchive)
