import { Hono } from "hono"
import { complete } from "./complete"
import { cancel } from "./cancel"

export const triggerRequests = new Hono().route("/", complete).route("/", cancel)
