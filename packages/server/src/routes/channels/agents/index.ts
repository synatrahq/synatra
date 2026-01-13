import { Hono } from "hono"
import { list } from "./list"
import { add } from "./add"
import { remove } from "./remove"

export const agents = new Hono().route("/", list).route("/", add).route("/", remove)
