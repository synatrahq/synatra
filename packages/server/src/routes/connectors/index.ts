import { Hono } from "hono"
import { list } from "./list"
import { create } from "./create"
import { del } from "./delete"
import { regenerateToken } from "./regenerate-token"

export const connectors = new Hono().route("/", list).route("/", create).route("/", del).route("/", regenerateToken)
