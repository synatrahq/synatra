import { Hono } from "hono"
import { list } from "./list"
import { get } from "./get"

export const templates = new Hono().route("/", list).route("/", get)
