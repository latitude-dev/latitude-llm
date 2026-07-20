import { CacheStore, OrganizationId, ProjectId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { createShowcase } from "../entities/showcase.ts"
import { ShowcaseNotReadyError } from "../errors.ts"
import { ShowcaseRepository } from "../ports/showcase-repository.ts"
import { createFakeShowcaseRepository } from "../testing/fake-showcase-repository.ts"
import { swapShowcaseUseCase } from "./swap-showcase.ts"

const ORG = OrganizationId("showcaseorg000000000000a")
const CURRENT = ProjectId("currentproject0000000001")
const NEXT = ProjectId("nextproject0000000000001")

const sqlClient: SqlClientShape = {
  organizationId: ORG,
  transaction: (effect) => effect,
  query: () => Effect.die(new Error("unexpected query")),
}

const createFakeCache = () => {
  const deleted: string[] = []
  const cache = {
    get: () => Effect.succeed(null),
    set: () => Effect.void,
    delete: (key: string) =>
      Effect.sync(() => {
        deleted.push(key)
      }),
  }
  return { cache, deleted }
}

const provideDeps = <A, E>(
  effect: Effect.Effect<A, E, SqlClient | ShowcaseRepository | CacheStore>,
  {
    showcaseRepository,
    cache,
  }: {
    showcaseRepository: ReturnType<typeof createFakeShowcaseRepository>["repository"]
    cache: ReturnType<typeof createFakeCache>["cache"]
  },
) =>
  effect.pipe(
    Effect.provideService(SqlClient, sqlClient),
    Effect.provideService(ShowcaseRepository, showcaseRepository),
    Effect.provideService(CacheStore, cache),
  )

describe("swapShowcaseUseCase", () => {
  it("flips current ← next, clears next, and invalidates the cache when next is ready", async () => {
    const { repository, store } = createFakeShowcaseRepository(
      createShowcase({ organizationId: ORG, currentProjectId: CURRENT, nextProjectId: NEXT, nextState: "ready" }),
    )
    const { cache, deleted } = createFakeCache()

    const swapped = await Effect.runPromise(
      provideDeps(swapShowcaseUseCase(), { showcaseRepository: repository, cache }),
    )

    expect(swapped.currentProjectId).toBe(NEXT)
    expect(swapped.nextProjectId).toBeNull()
    expect(swapped.nextState).toBeNull()
    expect(store.current?.currentProjectId).toBe(NEXT)
    expect(deleted).toEqual(["showcase:current"])
  })

  it("asserts next_state = 'ready' first: a still-building next fails and leaves current intact", async () => {
    const { repository, store } = createFakeShowcaseRepository(
      createShowcase({ organizationId: ORG, currentProjectId: CURRENT, nextProjectId: NEXT, nextState: "building" }),
    )
    const { cache, deleted } = createFakeCache()

    const error = await Effect.runPromise(
      provideDeps(swapShowcaseUseCase(), { showcaseRepository: repository, cache }).pipe(Effect.flip),
    )

    expect(error).toBeInstanceOf(ShowcaseNotReadyError)
    // current untouched, next still in flight, cache not invalidated
    expect(store.current?.currentProjectId).toBe(CURRENT)
    expect(store.current?.nextProjectId).toBe(NEXT)
    expect(store.current?.nextState).toBe("building")
    expect(deleted).toEqual([])
  })

  it("serializes concurrent swaps: only the first consumes the ready state, the second fails", async () => {
    const { repository, store } = createFakeShowcaseRepository(
      createShowcase({ organizationId: ORG, currentProjectId: CURRENT, nextProjectId: NEXT, nextState: "ready" }),
    )
    const { cache } = createFakeCache()

    const first = await Effect.runPromise(provideDeps(swapShowcaseUseCase(), { showcaseRepository: repository, cache }))
    const second = await Effect.runPromise(
      provideDeps(swapShowcaseUseCase(), { showcaseRepository: repository, cache }).pipe(Effect.flip),
    )

    expect(first.currentProjectId).toBe(NEXT)
    expect(second).toBeInstanceOf(ShowcaseNotReadyError)
    // the double-flip never happened: current stays at the first swap's result
    expect(store.current?.currentProjectId).toBe(NEXT)
  })
})
