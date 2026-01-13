import { Hono } from "hono"
import { upsert } from "./upsert"
import { del } from "./delete"

export const config = new Hono().route("/", upsert).route("/", del)
