import { Hono } from "hono"
import { getWorkingCopy } from "./get"
import { saveWorkingCopy } from "./save"

export const workingCopy = new Hono().route("/", getWorkingCopy).route("/", saveWorkingCopy)
