import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import pg from "pg"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"
import { seedAgentTemplates } from "./agent-template"

const { Pool } = pg

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is required")
  process.exit(1)
}

const pool = new Pool({ connectionString: url })
const db = drizzle(pool)

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, "../migrations")

async function main() {
  console.log(`Running migrations from ${migrationsFolder}`)
  await migrate(db, { migrationsFolder })
  console.log("Migrations completed")

  console.log("Seeding agent templates")
  await seedAgentTemplates()
  console.log("Seed completed")
}

main()
  .finally(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Predeploy failed:", err)
    process.exit(1)
  })
