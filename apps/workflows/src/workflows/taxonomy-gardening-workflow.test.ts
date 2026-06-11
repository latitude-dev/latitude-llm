import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockActivities, mockPatched } = vi.hoisted(() => {
  const mockPatched = vi.fn(() => true)
  const buildResult = {
    observationsScanned: 7,
    observationsAvailable: 7,
    observationsSampled: 7,
    sampleStrategy: "day_stratified_hash_round_robin",
    sampleCap: 1500,
    clustersBorn: 4,
    clustersContinued: 1,
    clustersDeprecated: 2,
    leavesAssigned: 7,
    maxDepthReached: 2,
    lineage: ["birth"],
    planKey: "org:oooooooooooooooooooooooo:taxonomy:gardenPlan:rrrrrrrrrrrrrrrrrrrrrrrr",
  }
  const mockActivities = {
    startGardenTaxonomyRunActivity: vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      runId: "r".repeat(24),
      now: "2026-01-01T00:00:00.000Z",
      observationsScanned: 7,
      observationsAvailable: 7,
      observationsSampled: 0,
      sampleStrategy: "day_stratified_hash_round_robin",
      sampleCap: 1500,
    })),
    buildHierarchicalGardenTaxonomyActivity: vi.fn(async () => buildResult),
    planHierarchicalGardenTaxonomyActivity: vi.fn(async () => buildResult),
    saveGardenTaxonomyClustersActivity: vi.fn(async () => ({ clustersSaved: 1 })),
    reassignGardenTaxonomyObservationsActivity: vi.fn(async () => ({ observationsReassigned: 1 })),
    deprecateGardenTaxonomyClustersActivity: vi.fn(async () => ({ clustersDeprecated: 1 })),
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
  return { mockActivities, mockPatched }
})

vi.mock("@temporalio/workflow", () => ({
  CancellationScope: {
    nonCancellable: async <T>(fn: () => Promise<T>) => fn(),
  },
  patched: mockPatched,
  proxyActivities: () => mockActivities,
  workflowInfo: () => ({ runId: "test-workflow-run-id" }),
}))

import { gardenTaxonomyWorkflow } from "./taxonomy-gardening-workflow.ts"

describe("taxonomy gardening workflow (divisive build)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPatched.mockReturnValue(true)
  })

  it("builds the tree once, names clusters deepest-first, and completes the run", async () => {
    const result = await gardenTaxonomyWorkflow({
      organizationId: "o".repeat(24),
      projectId: "p".repeat(24),
      dimension: "topic",
      trigger: "manual",
    })

    expect(mockActivities.planHierarchicalGardenTaxonomyActivity).toHaveBeenCalledTimes(1)
    expect(mockActivities.saveGardenTaxonomyClustersActivity).toHaveBeenCalledWith(
      expect.objectContaining({ planKey: "org:oooooooooooooooooooooooo:taxonomy:gardenPlan:rrrrrrrrrrrrrrrrrrrrrrrr" }),
    )
    expect(mockActivities.reassignGardenTaxonomyObservationsActivity).toHaveBeenCalledWith(
      expect.objectContaining({ planKey: "org:oooooooooooooooooooooooo:taxonomy:gardenPlan:rrrrrrrrrrrrrrrrrrrrrrrr" }),
    )
    expect(mockActivities.deprecateGardenTaxonomyClustersActivity).toHaveBeenCalledWith(
      expect.objectContaining({ planKey: "org:oooooooooooooooooooooooo:taxonomy:gardenPlan:rrrrrrrrrrrrrrrrrrrrrrrr" }),
    )
    expect(mockActivities.buildHierarchicalGardenTaxonomyActivity).not.toHaveBeenCalled()
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

  it("keeps the legacy build activity path replay-compatible", async () => {
    mockPatched.mockReturnValue(false)
    mockActivities.buildHierarchicalGardenTaxonomyActivity.mockResolvedValueOnce({
      observationsScanned: 7,
      clustersBorn: 4,
      clustersDeprecated: 2,
      leavesAssigned: 7,
      maxDepthReached: 2,
      lineage: ["birth"],
    } as never)

    await gardenTaxonomyWorkflow({
      organizationId: "o".repeat(24),
      projectId: "p".repeat(24),
      dimension: "topic",
      trigger: "manual",
    })

    expect(mockActivities.buildHierarchicalGardenTaxonomyActivity).toHaveBeenCalledTimes(1)
    expect(mockActivities.planHierarchicalGardenTaxonomyActivity).not.toHaveBeenCalled()
    expect(mockActivities.saveGardenTaxonomyClustersActivity).not.toHaveBeenCalled()
    expect(mockActivities.completeGardenTaxonomyRunActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        observationsAvailable: 7,
        observationsSampled: 7,
        sampleStrategy: "legacy_full_build",
        sampleCap: 7,
      }),
    )
  })

  it("marks the run failed when the build pass errors", async () => {
    mockActivities.planHierarchicalGardenTaxonomyActivity.mockRejectedValueOnce(new Error("garden failed"))

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
    mockActivities.planHierarchicalGardenTaxonomyActivity.mockRejectedValueOnce(cancellation)

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
