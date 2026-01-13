import { Hono } from "hono"
import { submit } from "./submit"

export const widgets = new Hono().route("/", submit)
