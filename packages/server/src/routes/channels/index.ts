import { Hono } from "hono"
import { list } from "./list"
import { get } from "./get"
import { create } from "./create"
import { update } from "./update"
import { archive } from "./archive"
import { unarchive } from "./unarchive"
import { members } from "./members"
import { agents } from "./agents"

export const channels = new Hono()
  .route("/", list)
  .route("/", get)
  .route("/", create)
  .route("/", update)
  .route("/", archive)
  .route("/", unarchive)
  .route("/", members)
  .route("/", agents)
