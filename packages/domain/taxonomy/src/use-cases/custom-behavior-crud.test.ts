import { QueuePublisher, type QueuePublisherShape, WorkflowTerminator } from "@domain/queue"
import { createFakeQueuePublisher, createFakeWorkflowTerminator } from "@domain/queue/testing"
import {
  ChSqlClient,
  CustomBehaviorId,
  FacetId,
  type FilterSet,
  OrganizationId,
  ProjectId,
  SqlClient,
  TaxonomyClusterId,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Exit, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { CUSTOM_BEHAVIOR_GARDENING_MIN_INTERVAL_MS, MAX_CUSTOM_BEHAVIORS_PER_PROJECT } from "../constants.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import { type CustomBehavior, CustomBehaviorStatus } from "../entities/custom-behavior.ts"
import type { TaxonomyFacet } from "../entities/facet.ts"
import {
  CustomBehaviorFilterInvalidError,
  CustomBehaviorLimitReachedError,
  CustomBehaviorNameInvalidError,
  FacetInvalidError,
} from "../errors.ts"
import { CustomBehaviorRepository } from "../ports/custom-behavior-repository.ts"
import { FacetProjectionRepository } from "../ports/facet-projection-repository.ts"
import { FacetRepository } from "../ports/facet-repository.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { TaxonomyRunRepository } from "../ports/taxonomy-run-repository.ts"
import { TaxonomyViewAssignmentRepository } from "../ports/taxonomy-view-assignment-repository.ts"
import { createFakeCustomBehaviorRepository } from "../testing/fake-custom-behavior-repository.ts"
import { createFakeFacetProjectionRepository } from "../testing/fake-facet-projection-repository.ts"
import { createFakeFacetRepository } from "../testing/fake-facet-repository.ts"
import { createFakeTaxonomyClusterRepository } from "../testing/fake-taxonomy-cluster-repository.ts"
import { createFakeTaxonomyRunRepository } from "../testing/fake-taxonomy-run-repository.ts"
import { createFakeTaxonomyViewAssignmentRepository } from "../testing/fake-taxonomy-view-assignment-repository.ts"
import { createCustomBehavior } from "./create-custom-behavior.ts"
import { deleteCustomBehavior } from "./delete-custom-behavior.ts"
import { deleteCustomBehaviorWithViews } from "./delete-custom-behavior-with-views.ts"
import { generateCustomBehavior } from "./generate-custom-behavior.ts"
import { taxonomyGardenCustomBehaviorDedupeKey } from "./trigger-project-gardening.ts"
import { updateCustomBehavior } from "./update-custom-behavior.ts"

const ORG_ID = OrganizationId("o".repeat(24))
const PROJECT_ID = ProjectId("p".repeat(24))
const OTHER_PROJECT_ID = ProjectId("q".repeat(24))
const FILTER: FilterSet = { models: [{ op: "in", value: ["gpt-4o"] }] }

const makeBehavior = (overrides: Partial<CustomBehavior> = {}): CustomBehavior => ({
  id: CustomBehaviorId("b".repeat(24)),
  organizationId: ORG_ID,
  projectId: PROJECT_ID,
  slug: "refunds",
  name: "Refunds",
  filterSet: FILTER,
  facetId: null,
  status: CustomBehaviorStatus.Pending,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
})

const makeFacetRow = (overrides: Partial<TaxonomyFacet> = {}): TaxonomyFacet => ({
  id: FacetId("f".repeat(24)),
  organizationId: ORG_ID,
  projectId: PROJECT_ID,
  slug: "user-goal",
  name: "User goal",
  description: "What the user is trying to accomplish.",
  instructions: "In one sentence, what was the user trying to accomplish?",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
})

const makeCluster = (overrides: Partial<TaxonomyCluster> = {}): TaxonomyCluster => ({
  id: TaxonomyClusterId("c".repeat(24)),
  organizationId: ORG_ID,
  projectId: PROJECT_ID,
  customBehaviorId: null,
  facetId: null,
  dimension: "topic",
  parentClusterId: null,
  depth: 0,
  path: "",
  splitLinkThreshold: null,
  name: "Refund requests",
  description: "Users asking for refunds.",
  centroid: { base: [1, 0], mass: 1, model: "fake", decay: 1, weights: { default: 1 } },
  observationCount: 10,
  state: "active",
  mergedIntoClusterId: null,
  firstObservedAt: new Date("2026-01-01T00:00:00.000Z"),
  lastObservedAt: new Date("2026-01-01T00:00:00.000Z"),
  clusteredAt: new Date("2026-01-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
})

function makeLayer(facets: readonly TaxonomyFacet[] = []) {
  const { repository, rows } = createFakeCustomBehaviorRepository()
  const facetRepo = createFakeFacetRepository(facets)
  const queue = createFakeQueuePublisher()
  const assignments = createFakeTaxonomyViewAssignmentRepository()
  const clusterRepo = createFakeTaxonomyClusterRepository()
  const runRepo = createFakeTaxonomyRunRepository()
  const projectionRepo = createFakeFacetProjectionRepository()
  const workflows = createFakeWorkflowTerminator()
  const layer = Layer.mergeAll(
    Layer.succeed(CustomBehaviorRepository, repository),
    Layer.succeed(FacetRepository, facetRepo.repository),
    Layer.succeed(TaxonomyViewAssignmentRepository, assignments.repository),
    Layer.succeed(TaxonomyClusterRepository, clusterRepo.repository),
    Layer.succeed(TaxonomyRunRepository, runRepo.repository),
    Layer.succeed(FacetProjectionRepository, projectionRepo.repository),
    Layer.succeed(QueuePublisher, queue.publisher),
    Layer.succeed(WorkflowTerminator, workflows.terminator),
    Layer.succeed(SqlClient, createFakeSqlClient()),
    Layer.succeed(ChSqlClient, createFakeChSqlClient()),
  )
  return { layer, rows, queue, workflows, assignments, clusterRepo, runRepo, projectionRepo, facetRepo }
}

// Same fakes, but terminate and publish record into one list so their relative order
// can be asserted: enqueueing first is what Temporal rejects as WorkflowAlreadyStarted.
function makeOrderedLayer() {
  const base = makeLayer()
  const calls: string[] = []
  const layer = Layer.mergeAll(
    base.layer,
    Layer.succeed(QueuePublisher, {
      ...base.queue.publisher,
      publish: (queue, task, payload, options) =>
        Effect.sync(() => calls.push("publish")).pipe(
          Effect.andThen(base.queue.publisher.publish(queue, task, payload, options)),
        ),
    } satisfies QueuePublisherShape),
    Layer.succeed(WorkflowTerminator, {
      terminate: (workflowId: string, reason?: string) =>
        Effect.sync(() => calls.push("terminate")).pipe(
          Effect.andThen(base.workflows.terminator.terminate(workflowId, reason)),
        ),
    }),
  )
  return { ...base, layer, calls }
}

describe("createCustomBehavior", () => {
  it("creates a behavior with a slugified name and auto-starts its first gardening run", async () => {
    const { layer, queue } = makeLayer()
    const result = await Effect.runPromise(
      createCustomBehavior({
        projectId: PROJECT_ID,
        name: "Refund Requests",
        filterSet: { models: [{ op: "in", value: ["gpt-4o"] }] },
      }).pipe(Effect.provide(layer)),
    )
    expect(result.slug).toBe("refund-requests")
    expect(result.name).toBe("Refund Requests")
    // Creating a behavior kicks off gardening immediately, so it comes back generating.
    expect(result.status).toBe(CustomBehaviorStatus.Generating)
    expect(queue.published).toHaveLength(1)
    expect(queue.published[0]).toMatchObject({ queue: "taxonomy", task: "gardenCustomBehavior" })
  })

  it("appends a random suffix on slug collision within the project", async () => {
    const { layer } = makeLayer()
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* createCustomBehavior({ projectId: PROJECT_ID, name: "Refunds", filterSet: FILTER })
        return yield* createCustomBehavior({ projectId: PROJECT_ID, name: "Refunds", filterSet: FILTER })
      }).pipe(Effect.provide(layer)),
    )
    expect(result.slug).toMatch(/^refunds-[a-z0-9]{4}$/)
  })

  it("rejects a name that slugifies into the reserved lat- namespace", async () => {
    const { layer } = makeLayer()
    await expect(
      Effect.runPromise(
        createCustomBehavior({ projectId: PROJECT_ID, name: "Lat topics", filterSet: FILTER }).pipe(
          Effect.provide(layer),
        ),
      ),
    ).rejects.toBeInstanceOf(CustomBehaviorNameInvalidError)
  })

  it("rejects a filter set containing topics", async () => {
    const { layer } = makeLayer()
    await expect(
      Effect.runPromise(
        createCustomBehavior({
          projectId: PROJECT_ID,
          name: "Circular",
          filterSet: { topics: [{ op: "in", value: ["support"] }] },
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toBeInstanceOf(CustomBehaviorFilterInvalidError)
  })

  it("rejects an empty filter set (an unfiltered scope is the global taxonomy)", async () => {
    const { layer } = makeLayer()
    await expect(
      Effect.runPromise(
        createCustomBehavior({ projectId: PROJECT_ID, name: "Everything", filterSet: {} }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toBeInstanceOf(CustomBehaviorFilterInvalidError)
  })

  const makeFacet = makeFacetRow

  it("allows an empty filter when a facet is chosen (a whole-project facet view) and stores the facet", async () => {
    const facetId = FacetId("f".repeat(24))
    const { layer, rows } = makeLayer([makeFacet({ id: facetId })])
    const result = await Effect.runPromise(
      createCustomBehavior({
        projectId: PROJECT_ID,
        name: "User goal",
        filterSet: {},
        facetSelection: { kind: "facet", facetId },
      }).pipe(Effect.provide(layer)),
    )
    expect(result.facetId).toBe(facetId)
    expect(rows.get(result.id)?.facetId).toBe(facetId)
    // Still auto-starts gardening: the facet gardens through the custom-behavior sweep.
    expect(result.status).toBe(CustomBehaviorStatus.Generating)
  })

  it("rejects a facetId that does not exist in the project", async () => {
    const { layer } = makeLayer() // no facets seeded
    await expect(
      Effect.runPromise(
        createCustomBehavior({
          projectId: PROJECT_ID,
          name: "Dangling facet",
          filterSet: {},
          facetSelection: { kind: "facet", facetId: FacetId("f".repeat(24)) },
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toBeInstanceOf(FacetInvalidError)
  })

  it("rejects a facetId that belongs to another project (same org)", async () => {
    const facetId = FacetId("f".repeat(24))
    const { layer } = makeLayer([makeFacet({ id: facetId, projectId: OTHER_PROJECT_ID })])
    await expect(
      Effect.runPromise(
        createCustomBehavior({
          projectId: PROJECT_ID,
          name: "Cross-project facet",
          filterSet: {},
          facetSelection: { kind: "facet", facetId },
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toBeInstanceOf(FacetInvalidError)
  })

  it("rejects an empty name", async () => {
    const { layer } = makeLayer()
    await expect(
      Effect.runPromise(
        createCustomBehavior({ projectId: PROJECT_ID, name: "   ", filterSet: FILTER }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toBeInstanceOf(CustomBehaviorNameInvalidError)
  })

  it("rejects a name with no url-safe characters instead of failing to slug", async () => {
    const { layer } = makeLayer()
    await expect(
      Effect.runPromise(
        createCustomBehavior({ projectId: PROJECT_ID, name: "!!! 🎉", filterSet: FILTER }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toBeInstanceOf(CustomBehaviorNameInvalidError)
  })

  it("rejects an 11th behavior once the project cap is reached", async () => {
    const { layer } = makeLayer()
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          for (let i = 0; i < MAX_CUSTOM_BEHAVIORS_PER_PROJECT; i++) {
            yield* createCustomBehavior({ projectId: PROJECT_ID, name: `Behavior ${i}`, filterSet: FILTER })
          }
          return yield* createCustomBehavior({ projectId: PROJECT_ID, name: "One too many", filterSet: FILTER })
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toBeInstanceOf(CustomBehaviorLimitReachedError)
  })

  it("counts the cap per project, so a different project can still create", async () => {
    const { layer } = makeLayer()
    const created = await Effect.runPromise(
      Effect.gen(function* () {
        for (let i = 0; i < MAX_CUSTOM_BEHAVIORS_PER_PROJECT; i++) {
          yield* createCustomBehavior({ projectId: PROJECT_ID, name: `Behavior ${i}`, filterSet: FILTER })
        }
        return yield* createCustomBehavior({ projectId: OTHER_PROJECT_ID, name: "Fresh project", filterSet: FILTER })
      }).pipe(Effect.provide(layer)),
    )
    expect(created.projectId).toBe(OTHER_PROJECT_ID)
  })
})

describe("updateCustomBehavior", () => {
  it("renames and regenerates the slug", async () => {
    const { layer } = makeLayer()
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const created = yield* createCustomBehavior({ projectId: PROJECT_ID, name: "Refunds", filterSet: FILTER })
        return yield* updateCustomBehavior({ id: created.id, name: "Chargebacks" })
      }).pipe(Effect.provide(layer)),
    )
    expect(result.name).toBe("Chargebacks")
    expect(result.slug).toBe("chargebacks")
  })

  it("rejects a rename to a name with no url-safe characters", async () => {
    const { layer } = makeLayer()
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const created = yield* createCustomBehavior({ projectId: PROJECT_ID, name: "Refunds", filterSet: FILTER })
          return yield* updateCustomBehavior({ id: created.id, name: "!!!" })
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toBeInstanceOf(CustomBehaviorNameInvalidError)
  })

  it("rejects a rename into the reserved lat- namespace", async () => {
    const { layer } = makeLayer()
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const created = yield* createCustomBehavior({ projectId: PROJECT_ID, name: "Refunds", filterSet: FILTER })
          return yield* updateCustomBehavior({ id: created.id, name: "Lat topics" })
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toBeInstanceOf(CustomBehaviorNameInvalidError)
  })

  it("purges the assignment slice and re-gardens when the cohort changes", async () => {
    const { layer, queue, assignments, workflows } = makeLayer()
    const behavior = await Effect.runPromise(
      Effect.gen(function* () {
        const created = yield* createCustomBehavior({ projectId: PROJECT_ID, name: "Refunds", filterSet: FILTER })
        yield* updateCustomBehavior({
          id: created.id,
          filterSet: { models: [{ op: "in", value: ["gpt-4o-mini"] }] },
        })
        return created
      }).pipe(Effect.provide(layer)),
    )
    expect(assignments.deletedBehaviorIds).toHaveLength(1)
    // One enqueue from the create, one from the cohort change.
    expect(queue.published).toHaveLength(2)
    expect(workflows.terminated).toEqual([
      {
        workflowId: taxonomyGardenCustomBehaviorDedupeKey({
          organizationId: behavior.organizationId,
          customBehaviorId: behavior.id,
        }),
        reason: "behavior cohort filter changed",
      },
    ])
  })

  it("terminates the in-flight garden before enqueueing the replacement, so it is not dropped as already-started", async () => {
    const { layer, rows, calls } = makeOrderedLayer()
    const behavior = makeBehavior()
    rows.set(behavior.id, behavior)

    await Effect.runPromise(
      updateCustomBehavior({
        id: behavior.id,
        filterSet: { models: [{ op: "in", value: ["gpt-4o-mini"] }] },
      }).pipe(Effect.provide(layer)),
    )

    expect(calls).toEqual(["terminate", "publish"])
  })

  it("leaves the gardened tree alone when the filter is re-sent unchanged", async () => {
    const { layer, queue, assignments, workflows } = makeLayer()
    await Effect.runPromise(
      Effect.gen(function* () {
        const created = yield* createCustomBehavior({ projectId: PROJECT_ID, name: "Refunds", filterSet: FILTER })
        // The edit modal always re-sends the current filter alongside the name, so a plain
        // rename must not read as a cohort change and kill a healthy in-flight garden.
        return yield* updateCustomBehavior({ id: created.id, name: "Chargebacks", filterSet: { ...FILTER } })
      }).pipe(Effect.provide(layer)),
    )
    expect(assignments.deletedBehaviorIds).toHaveLength(0)
    expect(queue.published).toHaveLength(1)
    expect(workflows.terminated).toEqual([])
  })

  it("leaves the garden running on a name-only update", async () => {
    const { layer, queue, workflows } = makeLayer()
    await Effect.runPromise(
      Effect.gen(function* () {
        const created = yield* createCustomBehavior({ projectId: PROJECT_ID, name: "Refunds", filterSet: FILTER })
        return yield* updateCustomBehavior({ id: created.id, name: "Chargebacks" })
      }).pipe(Effect.provide(layer)),
    )
    expect(workflows.terminated).toEqual([])
    expect(queue.published).toHaveLength(1)
  })

  it("rejects a filter set containing topics on update", async () => {
    const { layer } = makeLayer()
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const created = yield* createCustomBehavior({ projectId: PROJECT_ID, name: "Refunds", filterSet: FILTER })
          return yield* updateCustomBehavior({
            id: created.id,
            filterSet: { topics: [{ op: "in", value: ["support"] }] },
          })
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toBeInstanceOf(CustomBehaviorFilterInvalidError)
  })
})

describe("deleteCustomBehavior", () => {
  it("deletes a behavior so it is no longer listed (reads go straight through the repository)", async () => {
    const { layer } = makeLayer()
    const listed = await Effect.runPromise(
      Effect.gen(function* () {
        const created = yield* createCustomBehavior({ projectId: PROJECT_ID, name: "Refunds", filterSet: FILTER })
        yield* deleteCustomBehavior({ id: created.id })
        const repo = yield* CustomBehaviorRepository
        return yield* repo.listByProject({ projectId: PROJECT_ID })
      }).pipe(Effect.provide(layer)),
    )
    expect(listed).toHaveLength(0)
  })

  it("purges the scoped tree and the assignment slice, leaving the global topic tree alone", async () => {
    const { layer, clusterRepo, assignments } = makeLayer()
    const behaviorId = await Effect.runPromise(
      Effect.gen(function* () {
        const created = yield* createCustomBehavior({ projectId: PROJECT_ID, name: "Refunds", filterSet: FILTER })
        const clusters = yield* TaxonomyClusterRepository
        // One node of this behavior's scoped tree, and one of the live global tree.
        yield* clusters.save(makeCluster({ id: TaxonomyClusterId("c".repeat(24)), customBehaviorId: created.id }))
        yield* clusters.save(makeCluster({ id: TaxonomyClusterId("d".repeat(24)), customBehaviorId: null }))
        yield* deleteCustomBehavior({ id: created.id })
        return created.id
      }).pipe(Effect.provide(layer)),
    )
    const remaining = [...clusterRepo.clusters.values()]
    expect(remaining.map((cluster) => cluster.customBehaviorId)).toEqual([null])
    expect(assignments.deletedBehaviorIds).toEqual([behaviorId])
  })

  it("purges the facet and its projections when the deleted view was its last user", async () => {
    const facetId = FacetId("f".repeat(24))
    const { layer, facetRepo, projectionRepo } = makeLayer([makeFacetRow({ id: facetId })])
    await Effect.runPromise(
      Effect.gen(function* () {
        const created = yield* createCustomBehavior({
          projectId: PROJECT_ID,
          name: "User goal",
          filterSet: {},
          facetSelection: { kind: "facet", facetId },
        })
        yield* deleteCustomBehavior({ id: created.id })
      }).pipe(Effect.provide(layer)),
    )
    expect(facetRepo.rows.has(facetId)).toBe(false)
    expect(projectionRepo.deletedFacetIds).toEqual([facetId])
  })

  it("keeps the facet when another view still uses it", async () => {
    const facetId = FacetId("f".repeat(24))
    const { layer, facetRepo, projectionRepo } = makeLayer([makeFacetRow({ id: facetId })])
    await Effect.runPromise(
      Effect.gen(function* () {
        const whole = yield* createCustomBehavior({
          projectId: PROJECT_ID,
          name: "User goal",
          filterSet: {},
          facetSelection: { kind: "facet", facetId },
        })
        yield* createCustomBehavior({
          projectId: PROJECT_ID,
          name: "Marvin's goals",
          filterSet: FILTER,
          facetSelection: { kind: "facet", facetId },
        })
        yield* deleteCustomBehavior({ id: whole.id })
      }).pipe(Effect.provide(layer)),
    )
    expect(facetRepo.rows.has(facetId)).toBe(true)
    expect(projectionRepo.deletedFacetIds).toEqual([])
  })

  it("terminates the behavior's garden workflow with the caller's reason", async () => {
    const { layer, workflows } = makeLayer()
    const behavior = await Effect.runPromise(
      Effect.gen(function* () {
        const created = yield* createCustomBehavior({ projectId: PROJECT_ID, name: "Refunds", filterSet: FILTER })
        yield* deleteCustomBehavior({ id: created.id, reason: "behavior deleted by user" })
        return created
      }).pipe(Effect.provide(layer)),
    )
    expect(workflows.terminated).toEqual([
      {
        workflowId: taxonomyGardenCustomBehaviorDedupeKey({
          organizationId: behavior.organizationId,
          customBehaviorId: behavior.id,
        }),
        reason: "behavior deleted by user",
      },
    ])
  })

  it("fails to delete a missing behavior with NotFoundError", async () => {
    const { layer } = makeLayer()
    await expect(
      Effect.runPromise(deleteCustomBehavior({ id: CustomBehaviorId("z".repeat(24)) }).pipe(Effect.provide(layer))),
    ).rejects.toThrow()
  })
})

describe("deleteCustomBehaviorWithViews", () => {
  const facetId = FacetId("f".repeat(24))

  const seedLens = Effect.gen(function* () {
    const whole = yield* createCustomBehavior({
      projectId: PROJECT_ID,
      name: "User goal",
      filterSet: {},
      facetSelection: { kind: "facet", facetId },
    })
    const view = yield* createCustomBehavior({
      projectId: PROJECT_ID,
      name: "Marvin's goals",
      filterSet: FILTER,
      facetSelection: { kind: "facet", facetId },
    })
    return { whole, view }
  })

  it("deletes the lens's filtered views along with its whole-project behavior, tearing the lens down last", async () => {
    const { layer, rows, workflows, facetRepo, projectionRepo } = makeLayer([makeFacetRow({ id: facetId })])
    const { deleted, whole, view } = await Effect.runPromise(
      Effect.gen(function* () {
        const seeded = yield* seedLens
        const result = yield* deleteCustomBehaviorWithViews({ id: seeded.whole.id, reason: "behavior deleted by user" })
        return { deleted: result.deletedCount, ...seeded }
      }).pipe(Effect.provide(layer)),
    )

    expect(deleted).toBe(2)
    expect(rows.size).toBe(0)
    expect(workflows.terminated.map((termination) => termination.workflowId)).toEqual([
      taxonomyGardenCustomBehaviorDedupeKey({ organizationId: view.organizationId, customBehaviorId: view.id }),
      taxonomyGardenCustomBehaviorDedupeKey({ organizationId: whole.organizationId, customBehaviorId: whole.id }),
    ])
    // The lens survives its filtered view and dies with the whole-project behavior.
    expect(facetRepo.rows.has(facetId)).toBe(false)
    expect(projectionRepo.deletedFacetIds).toEqual([facetId])
  })

  it("leaves the lens and its whole-project behavior alone when only a filtered view is deleted", async () => {
    const { layer, rows, workflows, facetRepo, projectionRepo } = makeLayer([makeFacetRow({ id: facetId })])
    const { whole, view } = await Effect.runPromise(
      Effect.gen(function* () {
        const seeded = yield* seedLens
        yield* deleteCustomBehaviorWithViews({ id: seeded.view.id })
        return seeded
      }).pipe(Effect.provide(layer)),
    )

    expect([...rows.keys()]).toEqual([whole.id])
    expect(workflows.terminated.map((termination) => termination.workflowId)).toEqual([
      taxonomyGardenCustomBehaviorDedupeKey({ organizationId: view.organizationId, customBehaviorId: view.id }),
    ])
    expect(facetRepo.rows.has(facetId)).toBe(true)
    expect(projectionRepo.deletedFacetIds).toEqual([])
  })

  it("deletes a behavior with no lens on its own", async () => {
    const { layer, rows } = makeLayer()
    const deleted = await Effect.runPromise(
      Effect.gen(function* () {
        const created = yield* createCustomBehavior({ projectId: PROJECT_ID, name: "Refunds", filterSet: FILTER })
        const result = yield* deleteCustomBehaviorWithViews({ id: created.id })
        return result.deletedCount
      }).pipe(Effect.provide(layer)),
    )
    expect(deleted).toBe(1)
    expect(rows.size).toBe(0)
  })

  it("fails with NotFoundError when the target does not exist", async () => {
    const { layer } = makeLayer()
    await expect(
      Effect.runPromise(
        deleteCustomBehaviorWithViews({ id: CustomBehaviorId("z".repeat(24)) }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toThrow()
  })
})

describe("generateCustomBehavior", () => {
  it("flips the row to generating and enqueues gardenCustomBehavior with the record's org + project", async () => {
    const behavior = makeBehavior()
    const { repository, rows } = createFakeCustomBehaviorRepository([behavior])
    const queue = createFakeQueuePublisher()

    const result = await Effect.runPromise(
      generateCustomBehavior({ customBehaviorId: behavior.id }).pipe(
        Effect.provide(Layer.succeed(CustomBehaviorRepository, repository)),
        Effect.provide(Layer.succeed(QueuePublisher, queue.publisher)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      ),
    )

    expect(result.status).toBe(CustomBehaviorStatus.Generating)
    expect(rows.get(behavior.id)?.status).toBe(CustomBehaviorStatus.Generating)
    expect(queue.published).toHaveLength(1)
    expect(queue.published[0]).toMatchObject({
      queue: "taxonomy",
      task: "gardenCustomBehavior",
      payload: {
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        customBehaviorId: behavior.id,
        reason: "manual",
      },
      options: {
        dedupeKey: taxonomyGardenCustomBehaviorDedupeKey({ organizationId: ORG_ID, customBehaviorId: behavior.id }),
        // TTL-based dedupe (not a bare/retained jobId) so re-gardening keeps recurring.
        leadingThrottleMs: CUSTOM_BEHAVIOR_GARDENING_MIN_INTERVAL_MS,
      },
    })
  })

  it("rolls the status back to its prior value when the enqueue fails", async () => {
    const behavior = makeBehavior({ status: CustomBehaviorStatus.Failed })
    const { repository, rows } = createFakeCustomBehaviorRepository([behavior])
    const queue = createFakeQueuePublisher({ publish: () => Effect.die(new Error("queue down")) })

    const exit = await Effect.runPromiseExit(
      generateCustomBehavior({ customBehaviorId: behavior.id }).pipe(
        Effect.provide(Layer.succeed(CustomBehaviorRepository, repository)),
        Effect.provide(Layer.succeed(QueuePublisher, queue.publisher)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      ),
    )

    expect(Exit.isFailure(exit)).toBe(true)
    expect(rows.get(behavior.id)?.status).toBe(CustomBehaviorStatus.Failed)
  })

  it("fails with NotFoundError and enqueues nothing for a missing behavior", async () => {
    const { repository } = createFakeCustomBehaviorRepository([])
    const queue = createFakeQueuePublisher()

    const exit = await Effect.runPromiseExit(
      generateCustomBehavior({ customBehaviorId: CustomBehaviorId("z".repeat(24)) }).pipe(
        Effect.provide(Layer.succeed(CustomBehaviorRepository, repository)),
        Effect.provide(Layer.succeed(QueuePublisher, queue.publisher)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      ),
    )

    expect(Exit.isFailure(exit)).toBe(true)
    expect(queue.published).toHaveLength(0)
  })
})
