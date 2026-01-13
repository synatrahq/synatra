import { Hono } from "hono"
import { invitations } from "./invitations"

export const organizations = new Hono().route("/invitations", invitations)
