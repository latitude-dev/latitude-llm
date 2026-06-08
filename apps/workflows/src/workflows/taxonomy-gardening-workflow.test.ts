import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockActivities } = vi.hoisted(() => {
  const mockActivities = {
    startGardenTaxonomyRunActivity: vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      runId: "r".repeat(24),
      now: "2026-01-01T00:00:00.000Z",
      observationsScanned: 7,
    })),
    sweepGardenTaxonomyNoiseActivity: vi.fn(async () => ({ noiseScanned: 2, clustersBorn: 1, lineage: ["birth"] })),
    mergeGardenTaxonomyClustersActivity: vi.fn(async () => ({
      clustersMerged: 1,
      observationsReassigned: 3,
      lineage: ["merge"],
    })),
    deprecateGardenTaxonomyClustersActivity: vi.fn(async () => ({ clustersDeprecated: 1, lineage: ["death"] })),
    reassignGardenTaxonomyNoiseActivity: vi.fn(async () => ({ noiseScanned: 4, observationsReassigned: 2 })),
    recurseGardenTaxonomyTreeActivity: vi.fn(async () => ({
      nodesRecursed: 1,
      childrenBorn: 2,
      observationsMoved: 5,
      lineage: ["split"],
    })),
    reconcileGardenTaxonomyCountsActivity: vi.fn(async () => ({ clustersDeprecated: 0, lineage: [] })),
    planGardenTaxonomyNamingActivity: vi.fn(async () => ({
      clusterIds: ["c".repeat(24)],
      clustersScanned: 1,
    })),
    assertGardenTaxonomyQualityActivity: vi.fn(async () => ({ clustersScanned: 1, findings: [] })),
    nameGardenTaxonomyActivity: vi.fn(async () => ({ clustersNamed: 1, categoriesScanned: 1 })),
    nameTaxonomyClusterActivity: vi.fn(async () => ({ name: "Named cluster", description: "A named test cluster." })),
    emitGardenTaxonomyLineageActivity: vi.fn(async () => undefined),
    completeGardenTaxonomyRunActivity: vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      status: "completed",
    })),
    failGardenTaxonomyRunActivity: vi.fn(async (input: Record<string, unknown>) => ({ ...input, status: "failed" })),
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

import { gardenTaxonomyWorkflow } from "./taxonomy-gardening-workflow.ts"

describe("taxonomy gardening workflows", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("runs dimension gardening as ordered idempotent activities", async () => {
    const result = await gardenTaxonomyWorkflow({
      organizationId: "o".repeat(24),
      projectId: "p".repeat(24),
      dimension: "topic",
      trigger: "manual",
    })

    expect(mockActivities.startGardenTaxonomyRunActivity).toHaveBeenCalledWith({
      organizationId: "o".repeat(24),
      projectId: "p".repeat(24),
      dimension: "topic",
      trigger: "manual",
      workflowRunId: "test-workflow-run-id",
    })
    expect(mockActivities.planGardenTaxonomyNamingActivity).toHaveBeenCalledWith(
      expect.objectContaining({ lineage: ["birth"] }),
    )
    expect(mockActivities.planGardenTaxonomyNamingActivity).toHaveBeenCalledWith(
      expect.objectContaining({ lineage: ["split"] }),
    )
    expect(mockActivities.nameTaxonomyClusterActivity).toHaveBeenCalledWith({
      organizationId: "o".repeat(24),
      projectId: "p".repeat(24),
      clusterId: "c".repeat(24),
    })
    expect(mockActivities.completeGardenTaxonomyRunActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        observationsScanned: 7,
        noiseScanned: 18,
        clustersBorn: 9,
        clustersMerged: 3,
        clustersDeprecated: 3,
      }),
    )
    expect(result).toEqual(expect.objectContaining({ status: "completed" }))
  })

  it("marks the run failed and propagates failed step activity so Temporal retry policy owns recovery", async () => {
    mockActivities.mergeGardenTaxonomyClustersActivity.mockRejectedValueOnce(new Error("garden failed"))

    await expect(
      gardenTaxonomyWorkflow({
        organizationId: "o".repeat(24),
        projectId: "p".repeat(24),
        dimension: "topic",
        trigger: "manual",
      }),
    ).rejects.toThrow("garden failed")

    expect(mockActivities.failGardenTaxonomyRunActivity).toHaveBeenCalledWith(
      expect.objectContaining({ error: "garden failed" }),
    )
    expect(mockActivities.completeGardenTaxonomyRunActivity).not.toHaveBeenCalled()
  })

  it("records a failed run in a non-cancellable cleanup scope when cancellation interrupts a step", async () => {
    const cancellation = new Error("cancelled")
    cancellation.name = "CancelledFailure"
    mockActivities.reassignGardenTaxonomyNoiseActivity.mockRejectedValueOnce(cancellation)

    await expect(
      gardenTaxonomyWorkflow({
        organizationId: "o".repeat(24),
        projectId: "p".repeat(24),
        dimension: "topic",
        trigger: "manual",
      }),
    ).rejects.toThrow("cancelled")

    expect(mockActivities.failGardenTaxonomyRunActivity).toHaveBeenCalledWith(
      expect.objectContaining({ error: "cancelled" }),
    )
  })
})
