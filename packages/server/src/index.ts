import { serve } from "@hono/node-server"
import { app } from "./app"
import { config } from "./config"

export { app } from "./app"
export type { AppType } from "./app"

const port = config().app.port
console.log(`Server running on http://localhost:${port}`)
serve({ fetch: app.fetch, port })
