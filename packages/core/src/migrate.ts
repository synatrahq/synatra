import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import pg from "pg"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"

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

console.log(`Running migrations from ${migrationsFolder}`)

migrate(db, { migrationsFolder })
  .finally(() => pool.end())
  .then(() => {
    console.log("Migrations completed")
    process.exit(0)
  })
  .catch((err) => {
    console.error("Migration failed:", err)
    process.exit(1)
  })
