import { z } from "zod"
import { eq } from "drizzle-orm"
import { principal } from "./principal"
import { withDb } from "./database"
import { UserTable } from "./schema/user.sql"

export const UpdateUserSchema = z.object({
  name: z.string().min(1).optional(),
  image: z.string().optional(),
})

export async function getUser() {
  const userId = principal.userId()
  const [user] = await withDb((db) => db.select().from(UserTable).where(eq(UserTable.id, userId)))
  return user
}

export async function updateUser(input: z.input<typeof UpdateUserSchema>) {
  const data = UpdateUserSchema.parse(input)
  const userId = principal.userId()

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  }
  if (data.name !== undefined) updateData.name = data.name
  if (data.image !== undefined) updateData.image = data.image

  const [user] = await withDb((db) => db.update(UserTable).set(updateData).where(eq(UserTable.id, userId)).returning())

  return user
}
