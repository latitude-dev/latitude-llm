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
    topLevelClustersBuilt: 2,
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
      memberObservationIdsByClusterId: { ["d".repeat(24)]: ["obs-1", "obs-2"] },
    })),
    assertGardenTaxonomyQualityActivity: vi.fn(async () => ({ clustersScanned: 2, findings: [] })),
    nameTaxonomyClusterActivity: vi.fn(async () => ({ name: "Named cluster", description: "A named test cluster." })),
    emitGardenTaxonomyLineageActivity: vi.fn(async () => ({ lineageEmitted: 1 })),
    completeGardenTaxonomyRunActivity: vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      status: "completed",
    })),
    failGardenTaxonomyRunActivity: vi.fn(async (input: Record<string, unknown>) => ({ ...input, status: "failed" })),
    cleanupGardenTaxonomyStagingActivity: vi.fn(async () => ({ stagingDeleted: 0 })),
  }
  return { mockActivities }
})

vi.mock("@temporalio/workflow", () => ({
  CancellationScope: {
    nonCancellable: async <T>(fn: () => Promise<T>) => fn(),
  },
  patched: vi.fn(() => true),
  proxyActivities: () => mockActivities,
  workflowInfo: () => ({ runId: "test-workflow-run-id" }),
}))

import { patched } from "@temporalio/workflow"
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
    // `clearAllMocks` keeps implementations, so a test that flips one marker off must not leak.
    vi.mocked(patched).mockImplementation(() => true)
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

  // Above the gardening minimum but split into nothing: a bare root, with 18 prior clusters to retire.
  const degenerateBuildResult = {
    observationsScanned: 69,
    observationsAvailable: 69,
    observationsSampled: 69,
    sampleStrategy: "day_stratified_hash_round_robin",
    sampleCap: 1500,
    clustersBorn: 1,
    clustersContinued: 0,
    clustersDeprecated: 18,
    leavesAssigned: 69,
    maxDepthReached: 0,
    topLevelClustersBuilt: 0,
    lineage: ["death"],
    planKey: "org:oooooooooooooooooooooooo:taxonomy:gardenPlan:rrrrrrrrrrrrrrrrrrrrrrrr",
  }

  it.each([
    ["global", globalInput],
    ["scoped", scopedInput],
  ] as const)("keeps the prior tree serving when a %s rebuild collapses to a bare root", async (_label, input) => {
    mockActivities.planHierarchicalGardenTaxonomyActivity.mockResolvedValueOnce(degenerateBuildResult as never)

    const result = await gardenTaxonomyWorkflow(input)

    expect(patched).toHaveBeenCalledWith("taxonomy-gardening-keep-tree-on-degenerate-rebuild-v1")
    // Gated before any persist branch, so nothing is saved, reassigned, named or deprecated.
    expect(mockActivities.saveGardenTaxonomyClustersActivity).not.toHaveBeenCalled()
    expect(mockActivities.reassignGardenTaxonomyObservationsActivity).not.toHaveBeenCalled()
    expect(mockActivities.deprecateGardenTaxonomyClustersActivity).not.toHaveBeenCalled()
    expect(mockActivities.planGardenTaxonomyNamingActivity).not.toHaveBeenCalled()
    expect(mockActivities.cleanupGardenTaxonomyStagingActivity).not.toHaveBeenCalled()
    expect(mockActivities.completeGardenTaxonomyRunActivity).toHaveBeenCalledWith(
      expect.objectContaining({ clustersBorn: 0, clustersDeprecated: 0, observationsSampled: 69 }),
    )
    expect(result).toEqual(expect.objectContaining({ status: "completed" }))
  })

  it("still publishes a degenerate rebuild when replaying a pre-change history (marker off)", async () => {
    vi.mocked(patched).mockImplementation((id) => id !== "taxonomy-gardening-keep-tree-on-degenerate-rebuild-v1")
    mockActivities.planHierarchicalGardenTaxonomyActivity.mockResolvedValueOnce(degenerateBuildResult as never)

    await gardenTaxonomyWorkflow(globalInput)

    // An in-flight history recorded the full publish sequence, so replay must keep issuing it.
    expect(mockActivities.saveGardenTaxonomyClustersActivity).toHaveBeenCalledTimes(1)
    expect(mockActivities.deprecateGardenTaxonomyClustersActivity).toHaveBeenCalledTimes(1)
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

  it("names the staged tree BEFORE it is published, from the plan's own member ids", async () => {
    await gardenTaxonomyWorkflow(globalInput)

    expect(patched).toHaveBeenCalledWith("taxonomy-gardening-name-before-publish-v1")
    const namedAt = mockActivities.nameTaxonomyClusterActivity.mock.invocationCallOrder
    const reassignedAt = mockActivities.reassignGardenTaxonomyObservationsActivity.mock.invocationCallOrder[0] ?? 0
    // Every name lands before the reassignment moves the counts the Behaviours
    // read drives visibility from, so the swap publishes a tree that is both named
    // and populated — never a "Pending"-named active tree that reads as empty.
    expect(namedAt.every((order) => order < reassignedAt)).toBe(true)
    expect(mockActivities.planGardenTaxonomyNamingActivity).toHaveBeenCalledWith(
      expect.objectContaining({ planKey: "org:oooooooooooooooooooooooo:taxonomy:gardenPlan:rrrrrrrrrrrrrrrrrrrrrrrr" }),
    )
    const nameCalls = mockActivities.nameTaxonomyClusterActivity.mock.calls as unknown as Array<
      [{ readonly clusterId: string; readonly memberObservationIds?: readonly string[] }]
    >
    expect(nameCalls[0]?.[0]?.memberObservationIds).toEqual(["obs-1", "obs-2"])
  })

  it("a global naming failure cleans up staging, leaving the previous tree serving reads", async () => {
    mockActivities.nameTaxonomyClusterActivity.mockRejectedValueOnce(new Error("naming exploded"))

    await expect(gardenTaxonomyWorkflow(globalInput)).rejects.toThrow("naming exploded")

    // Naming now runs before the reassignment, so a naming failure is a failure
    // BEFORE publication: the staged tree is discarded and the old tree keeps
    // serving, instead of stranding an unnamed active tree that reads as empty.
    expect(mockActivities.reassignGardenTaxonomyObservationsActivity).not.toHaveBeenCalled()
    expect(mockActivities.deprecateGardenTaxonomyClustersActivity).not.toHaveBeenCalled()
    expect(mockActivities.cleanupGardenTaxonomyStagingActivity).toHaveBeenCalledTimes(1)
  })

  it("keeps naming a view's tree after publication (its slice only exists once reassigned)", async () => {
    await gardenTaxonomyWorkflow(scopedInput)

    const namedAt = mockActivities.nameTaxonomyClusterActivity.mock.invocationCallOrder
    const reassignedAt = mockActivities.reassignGardenTaxonomyObservationsActivity.mock.invocationCallOrder[0] ?? 0
    expect(namedAt.every((order) => order > reassignedAt)).toBe(true)
    expect(mockActivities.planGardenTaxonomyNamingActivity).toHaveBeenCalledWith(
      expect.not.objectContaining({ planKey: expect.anything() }),
    )
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

  it("carries the staging-swap patched marker and cleans up staging on a failure before reassignment", async () => {
    mockActivities.saveGardenTaxonomyClustersActivity.mockRejectedValueOnce(new Error("save exploded"))

    await expect(gardenTaxonomyWorkflow(globalInput)).rejects.toThrow("save exploded")

    expect(patched).toHaveBeenCalledWith("taxonomy-gardening-staging-swap-v1")
    // Reassignment never ran, so no observation points at the staging tree — it is
    // safe to clean up the orphaned staging rows.
    expect(mockActivities.reassignGardenTaxonomyObservationsActivity).not.toHaveBeenCalled()
    expect(mockActivities.cleanupGardenTaxonomyStagingActivity).toHaveBeenCalledTimes(1)
    expect(mockActivities.failGardenTaxonomyRunActivity).toHaveBeenCalledWith(
      expect.objectContaining({ error: "save exploded" }),
    )
  })

  it("does NOT delete staging once reassignment has run (it may already point observations there)", async () => {
    // Reassignment repoints the live window onto the staging leaves; if the swap
    // then fails, deleting staging would orphan those observations (#4121 review).
    mockActivities.deprecateGardenTaxonomyClustersActivity.mockRejectedValueOnce(new Error("swap exploded"))

    await expect(gardenTaxonomyWorkflow(globalInput)).rejects.toThrow("swap exploded")

    expect(mockActivities.reassignGardenTaxonomyObservationsActivity).toHaveBeenCalledTimes(1)
    expect(mockActivities.cleanupGardenTaxonomyStagingActivity).not.toHaveBeenCalled()
    expect(mockActivities.failGardenTaxonomyRunActivity).toHaveBeenCalledWith(
      expect.objectContaining({ error: "swap exploded" }),
    )
  })

  it("skips staging cleanup when replaying an in-flight pre-change history (patched marker off)", async () => {
    vi.mocked(patched).mockReturnValueOnce(false)
    mockActivities.saveGardenTaxonomyClustersActivity.mockRejectedValueOnce(new Error("save exploded"))

    await expect(gardenTaxonomyWorkflow(globalInput)).rejects.toThrow("save exploded")

    // A pre-change history never staged a tree, so the new cleanup activity must
    // not run — the marker reconciles the shape without changing old behavior.
    expect(mockActivities.cleanupGardenTaxonomyStagingActivity).not.toHaveBeenCalled()
    expect(mockActivities.failGardenTaxonomyRunActivity).toHaveBeenCalledWith(
      expect.objectContaining({ error: "save exploded" }),
    )
  })

  it("issues a mode-independent command sequence (replay-safe across off/enforced)", async () => {
    await gardenTaxonomyWorkflow(globalInput)

    // The workflow never reads which builder a run persists: mode resolution, the
    // build, and fallback selection all live in the plan activity, and the reassign
    // / deprecate / cleanup activities branch on the staged plan internally. So the
    // recorded command sequence is identical whatever the resolved mode, which is
    // what makes an in-flight history replay deterministically across a flag flip.
    // This locks that no mode-conditional command was added to the workflow.
    const names = Object.keys(mockActivities) as Array<keyof typeof mockActivities>
    const ordered = names
      .flatMap((name) => mockActivities[name].mock.invocationCallOrder.map((order) => ({ order, name })))
      .sort((left, right) => left.order - right.order)
      .map((entry) => entry.name)

    expect(ordered).toEqual([
      "startGardenTaxonomyRunActivity",
      "planHierarchicalGardenTaxonomyActivity",
      "saveGardenTaxonomyClustersActivity",
      "planGardenTaxonomyNamingActivity",
      "nameTaxonomyClusterActivity",
      "nameTaxonomyClusterActivity",
      "reassignGardenTaxonomyObservationsActivity",
      "deprecateGardenTaxonomyClustersActivity",
      "assertGardenTaxonomyQualityActivity",
      "emitGardenTaxonomyLineageActivity",
      "completeGardenTaxonomyRunActivity",
    ])
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
