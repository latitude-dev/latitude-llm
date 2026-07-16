import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockActivities } = vi.hoisted(() => {
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
    emitGardenTaxonomyLineageActivity: vi.fn(async () => ({ lineageEmitted: 1 })),
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
  deprecatePatch: vi.fn(),
  proxyActivities: () => mockActivities,
  workflowInfo: () => ({ runId: "test-workflow-run-id" }),
}))

import { gardenTaxonomyWorkflow } from "./taxonomy-gardening-workflow.ts"

const globalInput = {
  organizationId: "o".repeat(24),
  projectId: "p".repeat(24),
  dimension: "topic" as const,
  trigger: "manual" as const,
}

const scopedInput = { ...globalInput, customBehaviorId: "b".repeat(24) }

describe("taxonomy gardening workflow (divisive build)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("builds the tree once, names clusters deepest-first, and completes the run", async () => {
    const result = await gardenTaxonomyWorkflow(globalInput)

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
    expect(mockActivities.planGardenTaxonomyNamingActivity).toHaveBeenCalledWith(
      expect.objectContaining({ lineage: ["birth"] }),
    )

    // Global names carry no customBehaviorId — byte-identical to the pre-unification input.
    const nameCalls = mockActivities.nameTaxonomyClusterActivity.mock.calls as unknown as Array<
      [{ readonly clusterId: string; readonly customBehaviorId?: string }]
    >
    expect(nameCalls.map((call) => call[0]?.clusterId)).toEqual(["d".repeat(24), "c".repeat(24)])
    expect(nameCalls.every((call) => call[0] && !("customBehaviorId" in call[0]))).toBe(true)

    expect(mockActivities.completeGardenTaxonomyRunActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        clustersBorn: 4,
        clustersDeprecated: 2,
      }),
    )
    expect(result).toEqual(expect.objectContaining({ status: "completed" }))
  })

  it("threads the scope through the scoped naming loop", async () => {
    await gardenTaxonomyWorkflow(scopedInput)

    const nameCalls = mockActivities.nameTaxonomyClusterActivity.mock.calls as unknown as Array<
      [{ readonly clusterId: string; readonly customBehaviorId?: string }]
    >
    expect(nameCalls.every((call) => call[0]?.customBehaviorId === "b".repeat(24))).toBe(true)
  })

  it("completes empty and skips save/deprecate on a scoped cold-start (plan built no tree)", async () => {
    mockActivities.planHierarchicalGardenTaxonomyActivity.mockResolvedValueOnce({
      observationsScanned: 3,
      observationsAvailable: 3,
      observationsSampled: 3,
      sampleStrategy: "day_stratified_hash_round_robin",
      sampleCap: 1500,
      clustersBorn: 0,
      clustersContinued: 0,
      clustersDeprecated: 0,
      leavesAssigned: 0,
      maxDepthReached: 0,
      lineage: [],
      planKey: "org:oooooooooooooooooooooooo:taxonomy:gardenPlan:rrrrrrrrrrrrrrrrrrrrrrrr",
    } as never)

    const result = await gardenTaxonomyWorkflow(scopedInput)

    expect(mockActivities.saveGardenTaxonomyClustersActivity).not.toHaveBeenCalled()
    expect(mockActivities.reassignGardenTaxonomyObservationsActivity).not.toHaveBeenCalled()
    expect(mockActivities.deprecateGardenTaxonomyClustersActivity).not.toHaveBeenCalled()
    expect(mockActivities.planGardenTaxonomyNamingActivity).not.toHaveBeenCalled()
    expect(mockActivities.completeGardenTaxonomyRunActivity).toHaveBeenCalledWith(
      expect.objectContaining({ clustersBorn: 0, clustersDeprecated: 0 }),
    )
    expect(result).toEqual(expect.objectContaining({ status: "completed" }))
  })

  it("a post-build (naming) failure leaves the prior clusters active — no whole-tree wipe (#4036)", async () => {
    mockActivities.nameTaxonomyClusterActivity.mockRejectedValueOnce(new Error("naming exploded"))

    await expect(gardenTaxonomyWorkflow(scopedInput)).rejects.toThrow("naming exploded")

    // The build already ran (save/reassign) and the normal pre-naming deprecate
    // fired exactly once. The catch path only marks the run failed — it never
    // deprecates the whole tree, so the just-built clusters stay active.
    expect(mockActivities.saveGardenTaxonomyClustersActivity).toHaveBeenCalledTimes(1)
    expect(mockActivities.deprecateGardenTaxonomyClustersActivity).toHaveBeenCalledTimes(1)
    expect(mockActivities.failGardenTaxonomyRunActivity).toHaveBeenCalledWith(
      expect.objectContaining({ error: "naming exploded" }),
    )
    expect(mockActivities.completeGardenTaxonomyRunActivity).not.toHaveBeenCalled()
  })

  it("marks the run failed when the build pass errors", async () => {
    mockActivities.planHierarchicalGardenTaxonomyActivity.mockRejectedValueOnce(new Error("garden failed"))

    await expect(gardenTaxonomyWorkflow(globalInput)).rejects.toThrow("garden failed")

    expect(mockActivities.failGardenTaxonomyRunActivity).toHaveBeenCalledWith(
      expect.objectContaining({ error: "garden failed" }),
    )
    expect(mockActivities.completeGardenTaxonomyRunActivity).not.toHaveBeenCalled()
  })

  it("marks a scoped behavior failed when the START activity errors (no stuck generating)", async () => {
    mockActivities.startGardenTaxonomyRunActivity.mockRejectedValueOnce(new Error("start exploded"))

    await expect(gardenTaxonomyWorkflow(scopedInput)).rejects.toThrow("start exploded")

    // Start runs inside the try and the catch fails from the raw input (not the
    // never-returned start result), so a scoped start failure still marks the
    // behavior failed rather than leaving it stuck `generating`.
    expect(mockActivities.failGardenTaxonomyRunActivity).toHaveBeenCalledWith(
      expect.objectContaining({ customBehaviorId: "b".repeat(24), error: "start exploded" }),
    )
    expect(mockActivities.planHierarchicalGardenTaxonomyActivity).not.toHaveBeenCalled()
  })

  it("records a failed run in a non-cancellable cleanup scope when cancellation interrupts a step", async () => {
    const cancellation = new Error("cancelled")
    cancellation.name = "CancelledFailure"
    mockActivities.planHierarchicalGardenTaxonomyActivity.mockRejectedValueOnce(cancellation)

    await expect(gardenTaxonomyWorkflow(globalInput)).rejects.toThrow("cancelled")

    expect(mockActivities.failGardenTaxonomyRunActivity).toHaveBeenCalledWith(
      expect.objectContaining({ error: "cancelled" }),
    )
  })
})
