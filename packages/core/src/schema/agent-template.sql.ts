import { pgTable, uuid, text, timestamp, jsonb, boolean, integer, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import type { DemoScenario, TemplateCategory, ResourceType } from "../types"

export const AgentTemplateTable = pgTable(
  "agent_template",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull().$type<TemplateCategory>(),
    icon: text("icon").notNull(),
    iconColor: text("icon_color").notNull(),
    prompt: text("prompt").notNull(),
    suggestedResources: jsonb("suggested_resources").notNull().$type<ResourceType[]>().default([]),
    demoScenarios: jsonb("demo_scenarios").notNull().$type<DemoScenario[]>().default([]),
    displayOrder: integer("display_order").notNull().default(0),
    featured: boolean("featured").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("agent_template_display_order_idx").on(table.displayOrder)],
)

export type AgentTemplate = typeof AgentTemplateTable.$inferSelect
