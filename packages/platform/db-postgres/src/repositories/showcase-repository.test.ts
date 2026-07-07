import { OrganizationId, ProjectId, type SqlClient } from "@domain/shared"
import { createShowcase, ShowcaseNotFoundError, ShowcaseNotReadyError, ShowcaseRepository } from "@domain/showcase"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { showcase } from "../schema/showcase.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { ShowcaseRepositoryLive } from "./showcase-repository.ts"

const pg = setupTestPostgres()

const runWithLive = <A, E>(effect: Effect.Effect<A, E, ShowcaseRepository | SqlClient>) =>
  Effect.runPromise(effect.pipe(withPostgres(ShowcaseRepositoryLive, pg.adminPostgresClient)))

const makeId = (prefix: string): string => prefix.padEnd(24, "x").slice(0, 24)

const ORG = OrganizationId(makeId("org-showcase"))
const CURRENT = ProjectId(makeId("proj-current"))
const NEXT = ProjectId(makeId("proj-next"))

const seedPointer = async (nextState: "building" | "ready" | null, nextProjectId: ProjectId | null) => {
  await pg.db.delete(showcase)
  await runWithLive(
    Effect.gen(function* () {
      const repo = yield* ShowcaseRepository
      yield* repo.create(createShowcase({ organizationId: ORG, currentProjectId: CURRENT, nextProjectId, nextState }))
    }),
  )
}

describe("ShowcaseRepositoryLive", () => {
  beforeEach(async () => {
    await pg.db.delete(showcase)
  })

  it("beginNextBuild points next at the new project as building, leaving current intact", async () => {
    await seedPointer(null, null)

    const row = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* ShowcaseRepository
        return yield* repo.beginNextBuild(NEXT)
      }),
    )

    expect(row.currentProjectId).toBe(CURRENT)
    expect(row.nextProjectId).toBe(NEXT)
    expect(row.nextState).toBe("building")
  })

  it("markNextReady flips the in-flight build to ready", async () => {
    await seedPointer("building", NEXT)

    const row = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* ShowcaseRepository
        return yield* repo.markNextReady()
      }),
    )

    expect(row.nextState).toBe("ready")
    expect(row.nextProjectId).toBe(NEXT)
  })

  it("markNextReady on an idle pointer fails without writing an inconsistent ready state", async () => {
    await seedPointer(null, null)

    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* ShowcaseRepository
        return yield* repo.markNextReady()
      }).pipe(Effect.flip),
    )

    expect(result).toBeInstanceOf(ShowcaseNotFoundError)

    const after = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* ShowcaseRepository
        return yield* repo.find()
      }),
    )
    // no side effect: the idle pointer was not written to `ready`
    expect(after?.nextState).toBeNull()
    expect(after?.nextProjectId).toBeNull()
  })

  it("swap flips current ← next and resets to idle when next is ready", async () => {
    await seedPointer("ready", NEXT)

    const swapped = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* ShowcaseRepository
        return yield* repo.swap()
      }),
    )

    expect(swapped.currentProjectId).toBe(NEXT)
    expect(swapped.nextProjectId).toBeNull()
    expect(swapped.nextState).toBeNull()
  })

  it("swap asserts next_state = 'ready' first: a building next fails and leaves current intact", async () => {
    await seedPointer("building", NEXT)

    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* ShowcaseRepository
        return yield* repo.swap()
      }).pipe(Effect.flip),
    )

    expect(result).toBeInstanceOf(ShowcaseNotReadyError)

    const after = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* ShowcaseRepository
        return yield* repo.find()
      }),
    )
    expect(after?.currentProjectId).toBe(CURRENT)
    expect(after?.nextProjectId).toBe(NEXT)
    expect(after?.nextState).toBe("building")
  })

  it("a second swap after the pointer is idle fails ShowcaseNotReadyError (no double-flip)", async () => {
    await seedPointer("ready", NEXT)

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* ShowcaseRepository
        return yield* repo.swap()
      }),
    )
    const second = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* ShowcaseRepository
        return yield* repo.swap()
      }).pipe(Effect.flip),
    )

    expect(second).toBeInstanceOf(ShowcaseNotReadyError)

    const after = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* ShowcaseRepository
        return yield* repo.find()
      }),
    )
    expect(after?.currentProjectId).toBe(NEXT)
  })
})
