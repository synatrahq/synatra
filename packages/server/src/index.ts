import { serve } from "@hono/node-server"
import { app } from "./app"

export { app } from "./app"
export type { AppType } from "./app"

const port = Number(process.env.PORT ?? "8787")
console.log(`Server running on http://localhost:${port}`)
serve({ fetch: app.fetch, port })
