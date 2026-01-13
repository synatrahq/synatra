import { Hono } from "hono"
import { complete } from "./complete"
import { cancel } from "./cancel"

export const resourceRequests = new Hono().route("/", complete).route("/", cancel)
