import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockActivities, continued } = vi.hoisted(() => {
  const continued: unknown[] = []
  const mockActivities = {
    startTraceDeletionActivity: vi.fn(),
    prepareTraceDeletionBatchActivity: vi.fn(),
    purgeTraceDeletionBatchActivity: vi.fn(async () => undefined),
    purgeTraceDeletionSessionsActivity: vi.fn(async () => undefined),
    finishTraceDeletionActivity: vi.fn(async () => undefined),
  }
  return { mockActivities, continued }
})

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: () => mockActivities,
  continueAsNew: async (input: unknown) => {
    continued.push(input)
  },
  ApplicationFailure: {
    nonRetryable: (message: string, type: string) => Object.assign(new Error(message), { type }),
  },
}))

import { deleteTracesWorkflow } from "./delete-traces-workflow.ts"

const scope = { organizationId: "org-1", projectId: "proj-1", traceDeletionRequestId: "req-1" }
const snapshot = {
  finished: false,
  filters: { tags: [{ op: "contains", value: "x" }] },
  createdAt: "2026-10-27T00:00:00Z",
}

let nextTrace = 0
const batch = (traceCount: number) => {
  const traceIds = Array.from({ length: traceCount }, () => `trace-${nextTrace++}`)
  return {
    traceIds,
    sessionIds: traceCount > 0 ? ["session-1"] : [],
    counts: traceCount > 0 ? { "clickhouse.spans": traceCount * 3, "postgres.scores": 1 } : {},
  }
}

describe("deleteTracesWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    continued.length = 0
    nextTrace = 0
    mockActivities.startTraceDeletionActivity.mockResolvedValue(snapshot)
  })

  it("drains matching traces batch by batch and records the prepared counts", async () => {
    const first = batch(500)
    mockActivities.prepareTraceDeletionBatchActivity
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(batch(20))
      .mockResolvedValueOnce(batch(0))

    await deleteTracesWorkflow(scope)

    expect(mockActivities.prepareTraceDeletionBatchActivity).toHaveBeenCalledWith({ ...scope, snapshot })
    expect(mockActivities.purgeTraceDeletionBatchActivity).toHaveBeenCalledWith({
      ...scope,
      traceIds: first.traceIds,
      sessionIds: first.sessionIds,
    })
    expect(mockActivities.purgeTraceDeletionSessionsActivity).toHaveBeenCalledTimes(2)
    expect(mockActivities.finishTraceDeletionActivity).toHaveBeenCalledWith({
      ...scope,
      matchedTraceCount: 520,
      deletedRowCounts: { "clickhouse.spans": 1560, "postgres.scores": 2 },
    })
    expect(continued).toEqual([])
  })

  it("does nothing for a request that already finished", async () => {
    mockActivities.startTraceDeletionActivity.mockResolvedValue({ ...snapshot, finished: true })

    await deleteTracesWorkflow(scope)

    expect(mockActivities.prepareTraceDeletionBatchActivity).not.toHaveBeenCalled()
    expect(mockActivities.finishTraceDeletionActivity).not.toHaveBeenCalled()
  })

  it("continues as new with the running totals after a full run of batches", async () => {
    mockActivities.prepareTraceDeletionBatchActivity.mockImplementation(async () => batch(500))

    await deleteTracesWorkflow({
      ...scope,
      progress: { matchedTraceCount: 10, deletedRowCounts: { "postgres.scores": 5 } },
    })

    expect(mockActivities.finishTraceDeletionActivity).not.toHaveBeenCalled()
    expect(continued).toEqual([
      expect.objectContaining({
        ...scope,
        progress: expect.objectContaining({
          matchedTraceCount: 10 + 40 * 500,
          deletedRowCounts: expect.objectContaining({ "postgres.scores": 45 }),
        }),
      }),
    ])
  })

  it("fails the request when a purged batch lists again instead of looping", async () => {
    const stuck = batch(2)
    mockActivities.prepareTraceDeletionBatchActivity.mockResolvedValue(stuck)

    await expect(deleteTracesWorkflow(scope)).rejects.toThrow("could not be deleted")

    expect(mockActivities.purgeTraceDeletionBatchActivity).toHaveBeenCalledTimes(1)
    expect(mockActivities.finishTraceDeletionActivity).toHaveBeenCalledWith(
      expect.objectContaining({ matchedTraceCount: 2, error: "Matched traces could not be deleted" }),
    )
  })

  it("marks the request failed with what was purged so far, then fails the run", async () => {
    mockActivities.prepareTraceDeletionBatchActivity
      .mockResolvedValueOnce(batch(500))
      .mockRejectedValueOnce(Object.assign(new Error("activity failed"), { cause: new Error("ClickHouse is down") }))

    await expect(deleteTracesWorkflow(scope)).rejects.toThrow("ClickHouse is down")

    expect(mockActivities.finishTraceDeletionActivity).toHaveBeenCalledWith(
      expect.objectContaining({ matchedTraceCount: 500, error: "ClickHouse is down" }),
    )
  })
})
