import { Hono } from "hono"
import { list } from "./list"
import { deploy } from "./deploy"
import { adopt } from "./adopt"
import { checkout } from "./checkout"

export const releases = new Hono().route("/", list).route("/", deploy).route("/", adopt).route("/", checkout)
