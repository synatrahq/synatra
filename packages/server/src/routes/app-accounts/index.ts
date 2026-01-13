import { Hono } from "hono"
import { list } from "./list"
import { del } from "./delete"
import { oauth, oauthCallback } from "./oauth"
import { github, githubCallback } from "./github"

export { oauthCallback, githubCallback }

export const appAccounts = new Hono().route("/", list).route("/", del).route("/", oauth).route("/", github)
