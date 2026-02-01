import { describe, test, expect, vi, beforeEach } from "vitest"

vi.mock("../database", () => ({
  withDb: vi.fn(),
  withTx: vi.fn(),
  first: <T>(rows: T[]): T | undefined => rows[0],
}))

import { withDb } from "../database"
import { principal } from "../principal"
import { respondToRecipeExecution } from "../recipe"

type DbResult = {
  selectRows?: unknown[]
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
    }
    return callback(db as never)
  })
}

describe("respondToRecipeExecution", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns execution and response when created by the caller", async () => {
    setupWithDb([
      {
        selectRows: [
          {
            id: "exec-1",
            recipeId: "recipe-1",
            organizationId: "org-1",
            createdBy: "user-1",
            status: "waiting_input",
            pendingInputConfig: { fields: [] },
          },
        ],
      },
    ])

    const result = await principal.withUser(
      { userId: "user-1", organizationId: "org-1", email: "user@example.com" },
      () => respondToRecipeExecution({ id: "exec-1", response: { answer: "ok" } }),
    )

    expect(result.execution.id).toBe("exec-1")
    expect(result.response).toEqual({ answer: "ok" })
  })

  test("rejects when execution was created by another user", async () => {
    setupWithDb([
      {
        selectRows: [
          {
            id: "exec-1",
            recipeId: "recipe-1",
            organizationId: "org-1",
            createdBy: "user-2",
            status: "waiting_input",
            pendingInputConfig: { fields: [] },
          },
        ],
      },
    ])

    await expect(
      principal.withUser({ userId: "user-1", organizationId: "org-1", email: "user@example.com" }, () =>
        respondToRecipeExecution({ id: "exec-1", response: { answer: "ok" } }),
      ),
    ).rejects.toMatchObject({ name: "ForbiddenError" })
  })
})
