import { Hono } from "hono"
import { get } from "./get"
import { update } from "./update"

export const user = new Hono().route("/", get).route("/", update)
