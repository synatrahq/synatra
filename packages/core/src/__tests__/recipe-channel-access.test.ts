import { describe, test, expect, vi, beforeEach } from "vitest"

vi.mock("../database", () => ({
  withDb: vi.fn(),
  withTx: vi.fn(),
  first: <T>(rows: T[]): T | undefined => rows[0],
}))

vi.mock("../channel-member", () => ({
  canAccessCurrentUserChannelMember: vi.fn(),
}))

vi.mock("../channel", () => ({
  getChannelById: vi.fn(),
}))

import { withDb } from "../database"
import { canAccessCurrentUserChannelMember } from "../channel-member"
import { getChannelById } from "../channel"
import { principal } from "../principal"
import { addRecipeToChannel } from "../recipe"

type DbResult = {
  selectRows?: unknown[]
  insertRows?: unknown[]
}

function setupWithDb(results: DbResult[]) {
  vi.mocked(withDb).mockImplementation(async (callback) => {
    const result = results.shift()
    if (!result) throw new Error("Unexpected withDb call")
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            then: (fn: (rows: unknown[]) => unknown) => fn(result.selectRows ?? []),
          }),
        }),
      }),
      insert: () => ({
        values: () => ({
          returning: () => Promise.resolve(result.insertRows ?? []),
        }),
      }),
    }
    return callback(db as never)
  })
}

describe("addRecipeToChannel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("rejects when channel access is denied", async () => {
    setupWithDb([{ selectRows: [{ id: "recipe-1" }] }, { selectRows: [{ id: "member-1", role: "admin" }] }])

    vi.mocked(getChannelById).mockResolvedValue({ id: "channel-1" } as never)
    vi.mocked(canAccessCurrentUserChannelMember).mockResolvedValue(false)

    await expect(
      principal.withUser({ userId: "user-1", organizationId: "org-1", email: "user@example.com" }, () =>
        addRecipeToChannel({ recipeId: "recipe-1", channelId: "channel-1" }),
      ),
    ).rejects.toMatchObject({ name: "ForbiddenError" })

    expect(canAccessCurrentUserChannelMember).toHaveBeenCalledWith("channel-1")
  })

  test("adds recipe when channel access is allowed", async () => {
    setupWithDb([
      { selectRows: [{ id: "recipe-1" }] },
      { selectRows: [{ id: "member-1", role: "admin" }] },
      { insertRows: [{ id: "channel-recipe-1" }] },
    ])

    vi.mocked(getChannelById).mockResolvedValue({ id: "channel-1" } as never)
    vi.mocked(canAccessCurrentUserChannelMember).mockResolvedValue(true)

    const result = await principal.withUser(
      { userId: "user-1", organizationId: "org-1", email: "user@example.com" },
      () => addRecipeToChannel({ recipeId: "recipe-1", channelId: "channel-1" }),
    )

    expect(result).toMatchObject({ id: "channel-recipe-1" })
  })
})
