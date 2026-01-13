import { Hono } from "hono"
import { createBulk } from "./create-bulk"

export const invitations = new Hono().route("/", createBulk)
