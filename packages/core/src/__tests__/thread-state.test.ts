import { describe, test, expect, vi, beforeEach } from "vitest"

vi.mock("../database", () => ({
  withDb: vi.fn(),
  withTx: vi.fn(),
  first: <T>(rows: T[]): T | undefined => rows[0],
}))

vi.mock("../config", () => ({
  config: () => ({
    database: { url: "postgres://test" },
  }),
}))

import { withDb } from "../database"
import { principal } from "../principal"
import { generateThreadWorkflowId, updateThreadStatus, ensureThread, removeThread } from "../thread"

describe("Thread", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("generateWorkflowId", () => {
    test("generates unique workflow IDs", () => {
      const id1 = generateThreadWorkflowId()
      const id2 = generateThreadWorkflowId()

      expect(id1).not.toBe(id2)
    })

    test("starts with 'workflow-' prefix", () => {
      const id = generateThreadWorkflowId()
      expect(id.startsWith("workflow-")).toBe(true)
    })

    test("contains a UUID after the prefix", () => {
      const id = generateThreadWorkflowId()
      const uuid = id.replace("workflow-", "")
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    })
  })

  describe("updateStatus - state transitions", () => {
    const mockThread = (status: string) => ({
      id: "thread-1",
      organizationId: "org-1",
      status,
      seq: 1,
    })

    beforeEach(() => {
      vi.mocked(withDb).mockImplementation(async (callback) => {
        const mockDb = {
          select: () => ({
            from: () => ({
              where: () => ({
                then: (fn: (rows: unknown[]) => unknown) => fn([mockThread("running")]),
              }),
            }),
          }),
          update: () => ({
            set: () => ({
              where: () => ({
                returning: () => Promise.resolve([{ ...mockThread("running"), status: "completed" }]),
              }),
            }),
          }),
        }
        return callback(mockDb as never)
      })
    })

    describe("allowed transitions from 'running'", () => {
      const allowedFromRunning = ["waiting_human", "completed", "failed", "cancelled", "rejected", "skipped"]

      test.each(allowedFromRunning)("allows transition from running to %s", async (targetStatus) => {
        vi.mocked(withDb).mockImplementation(async (callback) => {
          const mockDb = {
            select: () => ({
              from: () => ({
                where: () => ({
                  then: (fn: (rows: unknown[]) => unknown) => fn([mockThread("running")]),
                }),
              }),
            }),
            update: () => ({
              set: () => ({
                where: () => ({
                  returning: () => Promise.resolve([{ ...mockThread("running"), status: targetStatus }]),
                }),
              }),
            }),
          }
          return callback(mockDb as never)
        })

        await expect(updateThreadStatus({ id: "thread-1", status: targetStatus as never })).resolves.toBeDefined()
      })
    })

    describe("allowed transitions from 'waiting_human'", () => {
      const allowedFromWaitingHuman = ["running", "completed", "failed", "cancelled", "rejected"]

      test.each(allowedFromWaitingHuman)("allows transition from waiting_human to %s", async (targetStatus) => {
        vi.mocked(withDb).mockImplementation(async (callback) => {
          const mockDb = {
            select: () => ({
              from: () => ({
                where: () => ({
                  then: (fn: (rows: unknown[]) => unknown) => fn([mockThread("waiting_human")]),
                }),
              }),
            }),
            update: () => ({
              set: () => ({
                where: () => ({
                  returning: () => Promise.resolve([{ ...mockThread("waiting_human"), status: targetStatus }]),
                }),
              }),
            }),
          }
          return callback(mockDb as never)
        })

        await expect(updateThreadStatus({ id: "thread-1", status: targetStatus as never })).resolves.toBeDefined()
      })
    })

    describe("allowed transitions from 'completed'", () => {
      test("allows transition from completed to running (reactivation)", async () => {
        vi.mocked(withDb).mockImplementation(async (callback) => {
          const mockDb = {
            select: () => ({
              from: () => ({
                where: () => ({
                  then: (fn: (rows: unknown[]) => unknown) => fn([mockThread("completed")]),
                }),
              }),
            }),
            update: () => ({
              set: () => ({
                where: () => ({
                  returning: () => Promise.resolve([{ ...mockThread("completed"), status: "running" }]),
                }),
              }),
            }),
          }
          return callback(mockDb as never)
        })

        await expect(updateThreadStatus({ id: "thread-1", status: "running" })).resolves.toBeDefined()
      })
    })

    describe("terminal states (no transitions allowed)", () => {
      const terminalStates = ["cancelled", "skipped"]
      const anyStatus = ["running", "waiting_human", "completed", "failed", "cancelled", "rejected", "skipped"]

      test.each(terminalStates)("disallows any transition from %s", async (terminalState) => {
        for (const targetStatus of anyStatus) {
          if (targetStatus === terminalState) continue

          vi.mocked(withDb).mockImplementation(async (callback) => {
            const mockDb = {
              select: () => ({
                from: () => ({
                  where: () => ({
                    then: (fn: (rows: unknown[]) => unknown) => fn([mockThread(terminalState)]),
                  }),
                }),
              }),
              update: () => ({
                set: () => ({
                  where: () => ({
                    returning: () => Promise.resolve([]),
                  }),
                }),
              }),
            }
            return callback(mockDb as never)
          })

          await expect(updateThreadStatus({ id: "thread-1", status: targetStatus as never })).rejects.toThrow(
            `Invalid status transition from ${terminalState} to ${targetStatus}`,
          )
        }
      })
    })

    describe("reactivatable states (can transition to running)", () => {
      const reactivatableStates = ["failed", "rejected"]

      test.each(reactivatableStates)("allows transition from %s to running (user retry)", async (fromState) => {
        vi.mocked(withDb).mockImplementation(async (callback) => {
          const mockDb = {
            select: () => ({
              from: () => ({
                where: () => ({
                  then: (fn: (rows: unknown[]) => unknown) => fn([mockThread(fromState)]),
                }),
              }),
            }),
            update: () => ({
              set: () => ({
                where: () => ({
                  returning: () => Promise.resolve([{ ...mockThread(fromState), status: "running" }]),
                }),
              }),
            }),
          }
          return callback(mockDb as never)
        })

        await expect(updateThreadStatus({ id: "thread-1", status: "running" })).resolves.toBeDefined()
      })

      test.each(reactivatableStates)("disallows transition from %s to non-running states", async (fromState) => {
        const disallowedTargets = ["waiting_human", "completed", "failed", "cancelled", "rejected", "skipped"].filter(
          (s) => s !== fromState,
        )

        for (const targetStatus of disallowedTargets) {
          vi.mocked(withDb).mockImplementation(async (callback) => {
            const mockDb = {
              select: () => ({
                from: () => ({
                  where: () => ({
                    then: (fn: (rows: unknown[]) => unknown) => fn([mockThread(fromState)]),
                  }),
                }),
              }),
              update: () => ({
                set: () => ({
                  where: () => ({
                    returning: () => Promise.resolve([]),
                  }),
                }),
              }),
            }
            return callback(mockDb as never)
          })

          await expect(updateThreadStatus({ id: "thread-1", status: targetStatus as never })).rejects.toThrow(
            `Invalid status transition from ${fromState} to ${targetStatus}`,
          )
        }
      })
    })

    describe("idempotent transitions", () => {
      test("allows transition from running to running (idempotent)", async () => {
        vi.mocked(withDb).mockImplementation(async (callback) => {
          const mockDb = {
            select: () => ({
              from: () => ({
                where: () => ({
                  then: (fn: (rows: unknown[]) => unknown) => fn([mockThread("running")]),
                }),
              }),
            }),
            update: () => ({
              set: () => ({
                where: () => ({
                  returning: () => Promise.resolve([mockThread("running")]),
                }),
              }),
            }),
          }
          return callback(mockDb as never)
        })

        await expect(updateThreadStatus({ id: "thread-1", status: "running" })).resolves.toBeDefined()
      })
    })

    describe("disallowed transitions", () => {
      test("disallows transition from completed to waiting_human", async () => {
        vi.mocked(withDb).mockImplementation(async (callback) => {
          const mockDb = {
            select: () => ({
              from: () => ({
                where: () => ({
                  then: (fn: (rows: unknown[]) => unknown) => fn([mockThread("completed")]),
                }),
              }),
            }),
            update: () => ({
              set: () => ({
                where: () => ({
                  returning: () => Promise.resolve([]),
                }),
              }),
            }),
          }
          return callback(mockDb as never)
        })

        await expect(updateThreadStatus({ id: "thread-1", status: "waiting_human" })).rejects.toThrow(
          "Invalid status transition from completed to waiting_human",
        )
      })

      test("disallows transition from waiting_human to skipped", async () => {
        vi.mocked(withDb).mockImplementation(async (callback) => {
          const mockDb = {
            select: () => ({
              from: () => ({
                where: () => ({
                  then: (fn: (rows: unknown[]) => unknown) => fn([mockThread("waiting_human")]),
                }),
              }),
            }),
            update: () => ({
              set: () => ({
                where: () => ({
                  returning: () => Promise.resolve([]),
                }),
              }),
            }),
          }
          return callback(mockDb as never)
        })

        await expect(updateThreadStatus({ id: "thread-1", status: "skipped" })).rejects.toThrow(
          "Invalid status transition from waiting_human to skipped",
        )
      })
    })

    test("throws error when thread is not found", async () => {
      vi.mocked(withDb).mockImplementation(async (callback) => {
        const mockDb = {
          select: () => ({
            from: () => ({
              where: () => ({
                then: (fn: (rows: unknown[]) => unknown) => fn([]),
              }),
            }),
          }),
        }
        return callback(mockDb as never)
      })

      await expect(updateThreadStatus({ id: "non-existent", status: "completed" })).rejects.toThrow("Thread not found")
    })
  })

  describe("state transition matrix documentation", () => {
    const transitionMatrix = {
      running: ["waiting_human", "completed", "failed", "cancelled", "rejected", "skipped"],
      waiting_human: ["running", "completed", "failed", "cancelled", "rejected"],
      completed: ["running"],
      failed: ["running"],
      cancelled: [],
      rejected: ["running"],
      skipped: [],
    }

    test("running state can transition to 6 states", () => {
      expect(transitionMatrix.running.length).toBe(6)
    })

    test("waiting_human state can transition to 5 states", () => {
      expect(transitionMatrix.waiting_human.length).toBe(5)
    })

    test("completed state can only transition to running", () => {
      expect(transitionMatrix.completed).toEqual(["running"])
    })

    test("failed state can transition to running (user retry)", () => {
      expect(transitionMatrix.failed).toEqual(["running"])
    })

    test("cancelled state is terminal", () => {
      expect(transitionMatrix.cancelled.length).toBe(0)
    })

    test("rejected state can transition to running (user retry)", () => {
      expect(transitionMatrix.rejected).toEqual(["running"])
    })

    test("skipped state is terminal", () => {
      expect(transitionMatrix.skipped.length).toBe(0)
    })
  })

  describe("ensure", () => {
    test("returns existing thread if id provided and found", async () => {
      vi.mocked(withDb).mockImplementation(async (callback) => {
        const mockDb = {
          select: () => ({
            from: () => ({
              where: () => ({
                then: (fn: (rows: unknown[]) => unknown) => fn([{ id: "existing-thread" }]),
              }),
            }),
          }),
        }
        return callback(mockDb as never)
      })

      const result = await ensureThread({
        id: "existing-thread",
        organizationId: "org-1",
        environmentId: "env-1",
        channelId: "channel-1",
        agentId: "agent-1",
        agentReleaseId: "release-1",
        agentConfigHash: "hash-1",
        workflowId: "wf-1",
        subject: "Test",
        payload: {},
      })

      expect(result.created).toBe(false)
      expect(result.threadId).toBe("existing-thread")
    })

    test("creates new thread if id not provided", async () => {
      vi.mocked(withDb).mockImplementation(async (callback) => {
        const mockDb = {
          insert: () => ({
            values: () => ({
              returning: () => Promise.resolve([{ id: "new-thread-id" }]),
            }),
          }),
        }
        return callback(mockDb as never)
      })

      const result = await ensureThread({
        organizationId: "org-1",
        environmentId: "env-1",
        channelId: "channel-1",
        agentId: "agent-1",
        agentReleaseId: "release-1",
        agentConfigHash: "hash-1",
        workflowId: "wf-1",
        subject: "Test",
        payload: {},
      })

      expect(result.created).toBe(true)
      expect(result.threadId).toBe("new-thread-id")
    })

    test("creates new thread if id provided but not found", async () => {
      let selectCalled = false
      vi.mocked(withDb).mockImplementation(async (callback) => {
        const mockDb = {
          select: () => ({
            from: () => ({
              where: () => ({
                then: (fn: (rows: unknown[]) => unknown) => {
                  selectCalled = true
                  return fn([])
                },
              }),
            }),
          }),
          insert: () => ({
            values: () => ({
              returning: () => Promise.resolve([{ id: "created-thread" }]),
            }),
          }),
        }
        return callback(mockDb as never)
      })

      const result = await ensureThread({
        id: "non-existent",
        organizationId: "org-1",
        environmentId: "env-1",
        channelId: "channel-1",
        agentId: "agent-1",
        agentReleaseId: "release-1",
        agentConfigHash: "hash-1",
        workflowId: "wf-1",
        subject: "Test",
        payload: {},
      })

      expect(selectCalled).toBe(true)
      expect(result.created).toBe(true)
    })
  })

  describe("remove", () => {
    test("deletes thread and returns deleted id", async () => {
      vi.mocked(withDb).mockImplementation(async (callback) => {
        const mockDb = {
          delete: () => ({
            where: () => ({
              returning: () => Promise.resolve([{ id: "thread-to-delete" }]),
            }),
          }),
        }
        return callback(mockDb as never)
      })

      const result = await principal.withUser({ userId: "u1", organizationId: "org-1", email: "e@e.com" }, () =>
        removeThread({ id: "thread-to-delete" }),
      )

      expect(result).toEqual({ id: "thread-to-delete" })
    })

    test("returns null when thread not found", async () => {
      vi.mocked(withDb).mockImplementation(async (callback) => {
        const mockDb = {
          delete: () => ({
            where: () => ({
              returning: () => Promise.resolve([]),
            }),
          }),
        }
        return callback(mockDb as never)
      })

      const result = await principal.withUser({ userId: "u1", organizationId: "org-1", email: "e@e.com" }, () =>
        removeThread({ id: "non-existent" }),
      )

      expect(result).toBeNull()
    })

    test("scopes delete by organizationId", async () => {
      let capturedWhere: unknown
      vi.mocked(withDb).mockImplementation(async (callback) => {
        const mockDb = {
          delete: () => ({
            where: (condition: unknown) => {
              capturedWhere = condition
              return {
                returning: () => Promise.resolve([{ id: "thread-1" }]),
              }
            },
          }),
        }
        return callback(mockDb as never)
      })

      await principal.withUser({ userId: "u1", organizationId: "org-specific", email: "e@e.com" }, () =>
        removeThread({ id: "thread-1" }),
      )

      expect(capturedWhere).toBeDefined()
    })
  })
})
