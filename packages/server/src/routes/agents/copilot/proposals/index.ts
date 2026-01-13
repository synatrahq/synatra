import { Hono } from "hono"
import { approve } from "./approve"
import { reject } from "./reject"

export const proposals = new Hono().route("/", approve).route("/", reject)
