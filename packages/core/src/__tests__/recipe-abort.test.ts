import { describe, test, expect, vi, beforeEach } from "vitest"

vi.mock("../database", () => ({
  withDb: vi.fn(),
  withTx: vi.fn(),
  first: <T>(rows: T[]): T | undefined => rows[0],
}))

import { withDb } from "../database"
import { principal } from "../principal"
import { abortRecipeExecution } from "../recipe"

type DbResult = {
  selectRows?: unknown[]
  updateRows?: unknown[]
  onUpdate?: (data: Record<string, unknown>) => void
  onDelete?: () => void
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
      update: () => ({
        set: (data: Record<string, unknown>) => {
          result.onUpdate?.(data)
          return {
            where: () => ({
              returning: () => Promise.resolve(result.updateRows ?? []),
            }),
          }
        },
      }),
      delete: () => ({
        where: () => {
          result.onDelete?.()
          return Promise.resolve([])
        },
      }),
    }
    return callback(db as never)
  })
}

describe("abortRecipeExecution", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("aborts a waiting input execution", async () => {
    const execution = {
      id: "exec-1",
      recipeId: "recipe-1",
      organizationId: "org-1",
      createdBy: "user-1",
      status: "waiting_input",
      pendingInputConfig: { fields: [] },
    }
    const abortedAt = new Date()
    let updateData: Record<string, unknown> | undefined

    setupWithDb([
      { selectRows: [execution] },
      {
        updateRows: [
          {
            ...execution,
            status: "aborted",
            abortedAt,
            pendingInputConfig: null,
          },
        ],
        onUpdate: (data) => {
          updateData = data
        },
      },
    ])

    const result = await principal.withUser(
      { userId: "user-1", organizationId: "org-1", email: "user@example.com" },
      () => abortRecipeExecution({ id: "exec-1" }),
    )

    expect(result.status).toBe("aborted")
    expect(result.abortedAt).toBe(abortedAt)
    expect(updateData?.status).toBe("aborted")
    expect(updateData?.pendingInputConfig).toBeNull()
  })

  test("rejects when execution is not waiting for input", async () => {
    setupWithDb([
      {
        selectRows: [
          {
            id: "exec-1",
            recipeId: "recipe-1",
            organizationId: "org-1",
            createdBy: "user-1",
            status: "completed",
          },
        ],
      },
    ])

    await expect(
      principal.withUser({ userId: "user-1", organizationId: "org-1", email: "user@example.com" }, () =>
        abortRecipeExecution({ id: "exec-1" }),
      ),
    ).rejects.toMatchObject({ name: "ConflictError" })
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
          },
        ],
      },
    ])

    await expect(
      principal.withUser({ userId: "user-1", organizationId: "org-1", email: "user@example.com" }, () =>
        abortRecipeExecution({ id: "exec-1" }),
      ),
    ).rejects.toMatchObject({ name: "ForbiddenError" })
  })

  test("returns not found when execution does not exist", async () => {
    setupWithDb([{ selectRows: [] }])

    await expect(
      principal.withUser({ userId: "user-1", organizationId: "org-1", email: "user@example.com" }, () =>
        abortRecipeExecution({ id: "exec-1" }),
      ),
    ).rejects.toMatchObject({ name: "NotFoundError" })
  })

  test("is idempotent when execution is already aborted", async () => {
    const execution = {
      id: "exec-1",
      recipeId: "recipe-1",
      organizationId: "org-1",
      createdBy: "user-1",
      status: "aborted",
    }

    setupWithDb([{ selectRows: [execution] }])

    const result = await principal.withUser(
      { userId: "user-1", organizationId: "org-1", email: "user@example.com" },
      () => abortRecipeExecution({ id: "exec-1" }),
    )

    expect(result.status).toBe("aborted")
  })
})
