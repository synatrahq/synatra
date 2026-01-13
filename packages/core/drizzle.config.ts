import { defineConfig } from "drizzle-kit"
import { config } from "./src/config"

const {
  database: { url },
} = config()

export default defineConfig({
  schema: ["./src/**/*.sql.ts"],
  out: "./migrations",
  strict: true,
  verbose: true,
  dialect: "postgresql",
  dbCredentials: { url },
})
