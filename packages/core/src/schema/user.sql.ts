import { pgTable, uniqueIndex, uuid, timestamp, text, boolean } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const UserTable = pgTable(
  "user",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    name: text("name"),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("user_email_idx").on(table.email)],
)

export type User = typeof UserTable.$inferSelect
