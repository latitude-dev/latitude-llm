import { CustomBehaviorId, NotFoundError, OrganizationId, ProjectId, type SqlClient } from "@domain/shared"
import { type CustomBehavior, CustomBehaviorRepository, CustomBehaviorStatus } from "@domain/taxonomy"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { customBehaviors } from "../schema/custom-behaviors.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { CustomBehaviorRepositoryLive } from "./custom-behavior-repository.ts"

const ORG_ID = OrganizationId("org-custom-behavior-t".padEnd(24, "x").slice(0, 24))
const OTHER_ORG_ID = OrganizationId("org-custom-behavior-o".padEnd(24, "x").slice(0, 24))
const PROJECT_ID = ProjectId("proj-custom-behavior".padEnd(24, "x").slice(0, 24))
const OTHER_PROJECT_ID = ProjectId("proj-custom-behav-ot".padEnd(24, "x").slice(0, 24))

const pg = setupTestPostgres()

const runWithLive = <A, E>(effect: Effect.Effect<A, E, CustomBehaviorRepository | SqlClient>) =>
  Effect.runPromise(effect.pipe(withPostgres(CustomBehaviorRepositoryLive, pg.adminPostgresClient, ORG_ID)))

const runWithOtherOrg = <A, E>(effect: Effect.Effect<A, E, CustomBehaviorRepository | SqlClient>) =>
  Effect.runPromise(effect.pipe(withPostgres(CustomBehaviorRepositoryLive, pg.adminPostgresClient, OTHER_ORG_ID)))

let seq = 0
const makeBehavior = (overrides: Partial<CustomBehavior> = {}): CustomBehavior => {
  seq += 1
  const now = new Date("2026-06-01T12:00:00.000Z")
  return {
    id: CustomBehaviorId(`cb${seq}`.padEnd(24, "0")),
    organizationId: ORG_ID,
    projectId: PROJECT_ID,
    slug: "refunds",
    name: "Refunds",
    filterSet: { moments: [{ op: "in", value: ["escalation"] }] },
    status: CustomBehaviorStatus.Pending,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe("CustomBehaviorRepositoryLive", () => {
  beforeEach(async () => {
    await pg.db.delete(customBehaviors)
  })

  it("saves a behavior and finds it by id and slug", async () => {
    const behavior = makeBehavior()
    const fetched = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* CustomBehaviorRepository
        yield* repo.save(behavior)
        return yield* repo.findById(behavior.id)
      }),
    )
    expect(fetched.slug).toBe("refunds")
    expect(fetched.name).toBe("Refunds")
    expect(fetched.status).toBe(CustomBehaviorStatus.Pending)
    expect(fetched.filterSet).toEqual({ moments: [{ op: "in", value: ["escalation"] }] })

    const bySlug = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* CustomBehaviorRepository
        return yield* repo.findBySlug({ projectId: PROJECT_ID, slug: "refunds" })
      }),
    )
    expect(bySlug?.id).toBe(behavior.id)
  })

  it("returns NotFoundError for a missing id and null for a missing slug", async () => {
    await expect(
      runWithLive(
        Effect.gen(function* () {
          const repo = yield* CustomBehaviorRepository
          return yield* repo.findById(CustomBehaviorId("missing".padEnd(24, "0")))
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError)

    const bySlug = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* CustomBehaviorRepository
        return yield* repo.findBySlug({ projectId: PROJECT_ID, slug: "nope" })
      }),
    )
    expect(bySlug).toBeNull()
  })

  it("rejects a duplicate slug within the same project", async () => {
    await expect(
      runWithLive(
        Effect.gen(function* () {
          const repo = yield* CustomBehaviorRepository
          yield* repo.save(makeBehavior({ slug: "dupe" }))
          yield* repo.save(makeBehavior({ slug: "dupe" }))
        }),
      ),
    ).rejects.toThrow()
  })

  it("allows the same slug in different projects", async () => {
    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* CustomBehaviorRepository
        yield* repo.save(makeBehavior({ slug: "shared" }))
        yield* repo.save(makeBehavior({ slug: "shared", projectId: OTHER_PROJECT_ID }))
      }),
    )
    const counts = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* CustomBehaviorRepository
        const here = yield* repo.countBySlug({ projectId: PROJECT_ID, slug: "shared" })
        const there = yield* repo.countBySlug({ projectId: OTHER_PROJECT_ID, slug: "shared" })
        return { here, there }
      }),
    )
    expect(counts).toEqual({ here: 1, there: 1 })
  })

  it("counts behaviors per project and updates via save (upsert on id)", async () => {
    const behavior = makeBehavior()
    const { count, updated } = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* CustomBehaviorRepository
        yield* repo.save(behavior)
        yield* repo.save({ ...behavior, name: "Chargebacks", slug: "chargebacks" })
        const count = yield* repo.countByProject({ projectId: PROJECT_ID })
        const updated = yield* repo.findById(behavior.id)
        return { count, updated }
      }),
    )
    expect(count).toBe(1)
    expect(updated.name).toBe("Chargebacks")
    expect(updated.slug).toBe("chargebacks")
  })

  it("lists behaviors by project ordered by createdAt desc", async () => {
    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* CustomBehaviorRepository
        yield* repo.save(makeBehavior({ slug: "a", createdAt: new Date("2026-06-01T00:00:00.000Z") }))
        yield* repo.save(makeBehavior({ slug: "b", createdAt: new Date("2026-06-02T00:00:00.000Z") }))
        yield* repo.save(makeBehavior({ slug: "c", createdAt: new Date("2026-06-03T00:00:00.000Z") }))
      }),
    )
    const listed = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* CustomBehaviorRepository
        return yield* repo.listByProject({ projectId: PROJECT_ID })
      }),
    )
    expect(listed.map((b) => b.slug)).toEqual(["c", "b", "a"])
  })

  it("deletes a behavior", async () => {
    const behavior = makeBehavior()
    const listed = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* CustomBehaviorRepository
        yield* repo.save(behavior)
        yield* repo.delete(behavior.id)
        return yield* repo.listByProject({ projectId: PROJECT_ID })
      }),
    )
    expect(listed).toHaveLength(0)
  })

  it("isolates behaviors across organizations (a non-member org cannot read, count, or delete)", async () => {
    const behavior = makeBehavior()
    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* CustomBehaviorRepository
        yield* repo.save(behavior)
      }),
    )

    // Another org sees nothing.
    const otherOrgView = await runWithOtherOrg(
      Effect.gen(function* () {
        const repo = yield* CustomBehaviorRepository
        const listed = yield* repo.listByProject({ projectId: PROJECT_ID })
        const count = yield* repo.countByProject({ projectId: PROJECT_ID })
        const bySlug = yield* repo.findBySlug({ projectId: PROJECT_ID, slug: "refunds" })
        return { listed: listed.length, count, bySlug }
      }),
    )
    expect(otherOrgView).toEqual({ listed: 0, count: 0, bySlug: null })

    await expect(
      runWithOtherOrg(
        Effect.gen(function* () {
          const repo = yield* CustomBehaviorRepository
          return yield* repo.findById(behavior.id)
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError)

    // A cross-org delete must not remove the owner's row.
    await runWithOtherOrg(
      Effect.gen(function* () {
        const repo = yield* CustomBehaviorRepository
        yield* repo.delete(behavior.id)
      }),
    )
    const stillThere = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* CustomBehaviorRepository
        return yield* repo.findById(behavior.id)
      }),
    )
    expect(stillThere.id).toBe(behavior.id)
  })
})
