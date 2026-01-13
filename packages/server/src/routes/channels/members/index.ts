import { Hono } from "hono"
import { list } from "./list"
import { add } from "./add"
import { remove } from "./remove"
import { updateRole } from "./update-role"

export const members = new Hono().route("/", list).route("/", add).route("/", remove).route("/", updateRole)
