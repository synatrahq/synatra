import { Hono } from "hono"
import { current } from "./current"
import { history } from "./history"

export const usage = new Hono().route("/", current).route("/", history)
