import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockActivities } = vi.hoisted(() => {
  const builtResult = {
    outcome: "built" as const,
    observationsSampled: 20,
    clustersBorn: 3,
    clustersContinued: 1,
    leavesAssigned: 20,
    maxDepthReached: 2,
    deprecatedClusterIds: ["old1".padEnd(24, "0"), "old2".padEnd(24, "0")],
  }
  const mockActivities = {
    startGardenCustomBehaviorRunActivity: vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      runId: "r".repeat(24),
      now: "2026-01-01T00:00:00.000Z",
      filterSet: {},
      lookbackDays: 7,
    })),
    buildGardenCustomBehaviorTaxonomyActivity: vi.fn(async () => builtResult),
    planGardenCustomBehaviorNamingActivity: vi.fn(async () => ({
      clusterIdsByDepth: [
        { depth: 1, clusterIds: ["c".repeat(24)] },
        { depth: 0, clusterIds: ["d".repeat(24)] },
      ],
      clustersScanned: 2,
    })),
    nameGardenCustomBehaviorClusterActivity: vi.fn(async () => undefined),
    assertGardenCustomBehaviorQualityActivity: vi.fn(async () => undefined),
    deprecateGardenCustomBehaviorClustersActivity: vi.fn(async () => ({ clustersDeprecated: 2 })),
    cleanupGardenCustomBehaviorClustersActivity: vi.fn(async () => ({ clustersDeprecated: 4 })),
    completeGardenCustomBehaviorRunActivity: vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      status: "ready",
    })),
    failGardenCustomBehaviorRunActivity: vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      status: "failed",
    })),
  }
  return { mockActivities }
})

vi.mock("@temporalio/workflow", () => ({
  CancellationScope: {
    nonCancellable: async <T>(fn: () => Promise<T>) => fn(),
  },
  proxyActivities: () => mockActivities,
  workflowInfo: () => ({ runId: "test-workflow-run-id" }),
}))

import { gardenCustomBehaviorWorkflow } from "./garden-custom-behavior-workflow.ts"

const input = {
  organizationId: "o".repeat(24),
  projectId: "p".repeat(24),
  customBehaviorId: "b".repeat(24),
  trigger: "manual" as const,
}

describe("gardenCustomBehaviorWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("builds, names deepest-first, deprecates the prior tree, and completes without cleanup", async () => {
    const result = await gardenCustomBehaviorWorkflow(input)

    const nameCalls = mockActivities.nameGardenCustomBehaviorClusterActivity.mock.calls as unknown as Array<
      [{ readonly clusterId: string }]
    >
    expect(nameCalls.map((call) => call[0]?.clusterId)).toEqual(["c".repeat(24), "d".repeat(24)])
    expect(mockActivities.deprecateGardenCustomBehaviorClustersActivity).toHaveBeenCalledWith(
      expect.objectContaining({ clusterIds: ["old1".padEnd(24, "0"), "old2".padEnd(24, "0")] }),
    )
    expect(mockActivities.cleanupGardenCustomBehaviorClustersActivity).not.toHaveBeenCalled()
    expect(mockActivities.failGardenCustomBehaviorRunActivity).not.toHaveBeenCalled()
    expect(result).toEqual(expect.objectContaining({ status: "ready" }))
  })

  it("deprecates the partial scoped tree and marks the run failed when naming throws mid-run", async () => {
    mockActivities.nameGardenCustomBehaviorClusterActivity.mockRejectedValueOnce(new Error("naming exploded"))

    await expect(gardenCustomBehaviorWorkflow(input)).rejects.toThrow("naming exploded")

    // The prior-tree deprecate step never ran, but the failure cleanup did.
    expect(mockActivities.deprecateGardenCustomBehaviorClustersActivity).not.toHaveBeenCalled()
    expect(mockActivities.cleanupGardenCustomBehaviorClustersActivity).toHaveBeenCalledWith(
      expect.objectContaining({ customBehaviorId: "b".repeat(24) }),
    )
    expect(mockActivities.failGardenCustomBehaviorRunActivity).toHaveBeenCalledWith(
      expect.objectContaining({ error: "naming exploded" }),
    )
    expect(mockActivities.completeGardenCustomBehaviorRunActivity).not.toHaveBeenCalled()
  })

  it("still marks the run failed when the cleanup activity itself fails (best-effort)", async () => {
    mockActivities.assertGardenCustomBehaviorQualityActivity.mockRejectedValueOnce(new Error("quality gate failed"))
    mockActivities.cleanupGardenCustomBehaviorClustersActivity.mockRejectedValueOnce(new Error("cleanup also failed"))

    await expect(gardenCustomBehaviorWorkflow(input)).rejects.toThrow("quality gate failed")

    expect(mockActivities.cleanupGardenCustomBehaviorClustersActivity).toHaveBeenCalledTimes(1)
    expect(mockActivities.failGardenCustomBehaviorRunActivity).toHaveBeenCalledWith(
      expect.objectContaining({ error: "quality gate failed" }),
    )
  })

  it("does not deprecate a healthy prior tree when the build activity throws before writing", async () => {
    mockActivities.buildGardenCustomBehaviorTaxonomyActivity.mockRejectedValueOnce(
      new Error("clickhouse sampling failed"),
    )

    await expect(gardenCustomBehaviorWorkflow(input)).rejects.toThrow("clickhouse sampling failed")

    // Nothing was persisted, so the prior tree must stay intact — no cleanup.
    expect(mockActivities.cleanupGardenCustomBehaviorClustersActivity).not.toHaveBeenCalled()
    expect(mockActivities.deprecateGardenCustomBehaviorClustersActivity).not.toHaveBeenCalled()
    expect(mockActivities.failGardenCustomBehaviorRunActivity).toHaveBeenCalledWith(
      expect.objectContaining({ error: "clickhouse sampling failed" }),
    )
  })

  it("marks the run failed and skips cleanup when the start activity throws", async () => {
    mockActivities.startGardenCustomBehaviorRunActivity.mockRejectedValueOnce(new Error("behavior unreadable"))

    await expect(gardenCustomBehaviorWorkflow(input)).rejects.toThrow("behavior unreadable")

    expect(mockActivities.buildGardenCustomBehaviorTaxonomyActivity).not.toHaveBeenCalled()
    expect(mockActivities.cleanupGardenCustomBehaviorClustersActivity).not.toHaveBeenCalled()
    expect(mockActivities.failGardenCustomBehaviorRunActivity).toHaveBeenCalledWith(
      expect.objectContaining({ error: "behavior unreadable" }),
    )
  })

  it("leaves any prior tree untouched (no cleanup, no deprecate) when observations are insufficient", async () => {
    mockActivities.buildGardenCustomBehaviorTaxonomyActivity.mockResolvedValueOnce({
      outcome: "insufficient_observations",
      observationsSampled: 3,
    } as never)

    const result = await gardenCustomBehaviorWorkflow(input)

    expect(mockActivities.planGardenCustomBehaviorNamingActivity).not.toHaveBeenCalled()
    expect(mockActivities.deprecateGardenCustomBehaviorClustersActivity).not.toHaveBeenCalled()
    expect(mockActivities.cleanupGardenCustomBehaviorClustersActivity).not.toHaveBeenCalled()
    expect(mockActivities.failGardenCustomBehaviorRunActivity).toHaveBeenCalledWith(
      expect.objectContaining({ error: "insufficient matching observations to build a scoped taxonomy" }),
    )
    expect(result).toEqual(expect.objectContaining({ status: "failed" }))
  })
})
