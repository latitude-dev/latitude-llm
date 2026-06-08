import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockActivities } = vi.hoisted(() => {
  const mockActivities = {
    startGardenTaxonomyRunActivity: vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      runId: "r".repeat(24),
      now: "2026-01-01T00:00:00.000Z",
      observationsScanned: 7,
    })),
    buildHierarchicalGardenTaxonomyActivity: vi.fn(async () => ({
      observationsScanned: 7,
      clustersBorn: 4,
      clustersDeprecated: 2,
      leavesAssigned: 7,
      maxDepthReached: 2,
      lineage: ["birth"],
    })),
    planGardenTaxonomyNamingActivity: vi.fn(async () => ({
      clusterIds: ["c".repeat(24), "d".repeat(24)],
      clusterIdsByDepth: [
        { depth: 2, clusterIds: ["d".repeat(24)] },
        { depth: 0, clusterIds: ["c".repeat(24)] },
      ],
      clustersScanned: 2,
    })),
    assertGardenTaxonomyQualityActivity: vi.fn(async () => ({ clustersScanned: 2, findings: [] })),
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

describe("taxonomy gardening workflow (divisive build)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("builds the tree once, names clusters deepest-first, and completes the run", async () => {
    const result = await gardenTaxonomyWorkflow({
      organizationId: "o".repeat(24),
      projectId: "p".repeat(24),
      dimension: "topic",
      trigger: "manual",
    })

    expect(mockActivities.buildHierarchicalGardenTaxonomyActivity).toHaveBeenCalledTimes(1)
    expect(mockActivities.planGardenTaxonomyNamingActivity).toHaveBeenCalledWith(
      expect.objectContaining({ lineage: ["birth"] }),
    )

    const nameCalls = mockActivities.nameTaxonomyClusterActivity.mock.calls as unknown as Array<
      [{ readonly clusterId: string }]
    >
    expect(nameCalls.map((call) => call[0]?.clusterId)).toEqual(["d".repeat(24), "c".repeat(24)])

    expect(mockActivities.completeGardenTaxonomyRunActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        clustersBorn: 4,
        clustersDeprecated: 2,
      }),
    )
    expect(result).toEqual(expect.objectContaining({ status: "completed" }))
  })

  it("marks the run failed when the build pass errors", async () => {
    mockActivities.buildHierarchicalGardenTaxonomyActivity.mockRejectedValueOnce(new Error("garden failed"))

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
    mockActivities.buildHierarchicalGardenTaxonomyActivity.mockRejectedValueOnce(cancellation)

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
