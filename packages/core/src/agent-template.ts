import { eq, notInArray } from "drizzle-orm"
import { withDb } from "./database"
import { AgentTemplateTable } from "./schema"
import { AGENT_TEMPLATES } from "./seed/agent-templates"

export async function listAgentTemplates() {
  return withDb((db) => db.select().from(AgentTemplateTable).orderBy(AgentTemplateTable.displayOrder))
}

export async function getAgentTemplateById(id: string) {
  return withDb((db) =>
    db
      .select()
      .from(AgentTemplateTable)
      .where(eq(AgentTemplateTable.id, id))
      .then((rows) => rows[0] ?? null),
  )
}

export async function seedAgentTemplates() {
  await withDb(async (db) => {
    const slugs = AGENT_TEMPLATES.map((t) => t.slug)

    for (const template of AGENT_TEMPLATES) {
      await db
        .insert(AgentTemplateTable)
        .values(template)
        .onConflictDoUpdate({
          target: AgentTemplateTable.slug,
          set: {
            name: template.name,
            description: template.description,
            category: template.category,
            icon: template.icon,
            iconColor: template.iconColor,
            prompt: template.prompt,
            suggestedResources: template.suggestedResources,
            demoScenarios: template.demoScenarios,
            displayOrder: template.displayOrder,
            featured: template.featured,
            updatedAt: new Date(),
          },
        })
    }

    await db.delete(AgentTemplateTable).where(notInArray(AgentTemplateTable.slug, slugs))
  })
}
