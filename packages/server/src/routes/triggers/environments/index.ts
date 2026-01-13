import { Hono } from "hono"
import { list } from "./list"
import { add } from "./add"
import { update } from "./update"
import { remove } from "./remove"
import { regenerateDebugSecret } from "./regenerate-debug-secret"

export const environments = new Hono()
  .route("/", list)
  .route("/", add)
  .route("/", update)
  .route("/", remove)
  .route("/", regenerateDebugSecret)
