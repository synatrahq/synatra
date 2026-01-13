import { Hono } from "hono"
import { deploy } from "./deploy"
import { list } from "./list"
import { adopt } from "./adopt"
import { checkout } from "./checkout"

export const releases = new Hono().route("/", deploy).route("/", list).route("/", adopt).route("/", checkout)
