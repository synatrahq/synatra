import { pgTable, uniqueIndex, uuid, timestamp, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { ChannelTable } from "./channel.sql"
import { RecipeTable } from "./recipe.sql"
import { UserTable } from "./user.sql"

export const ChannelRecipeTable = pgTable(
  "channel_recipe",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => ChannelTable.id, { onDelete: "cascade" }),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => RecipeTable.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => UserTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("channel_recipe_unique").on(table.channelId, table.recipeId),
    index("channel_recipe_recipe_idx").on(table.recipeId),
  ],
)

export type ChannelRecipe = typeof ChannelRecipeTable.$inferSelect
