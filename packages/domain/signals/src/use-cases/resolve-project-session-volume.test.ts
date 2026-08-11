import {
  CacheError,
  CacheStore,
  type CacheStoreShape,
  ChSqlClient,
  OrganizationId,
  ProjectId,
  RepositoryError,
} from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { SessionRepository } from "@domain/spans"
import { createFakeSessionRepository } from "@domain/spans/testing"
import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"
import { resolveProjectSessionVolumeUseCase } from "./resolve-project-session-volume.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))

const makeCache = (initial: string | null): { store: CacheStoreShape; writes: [string, string][] } => {
  const writes: [string, string][] = []
  return {
    writes,
    store: {
      get: () => Effect.succeed(initial),
      set: (key, value) => {
        writes.push([key, value])
        return Effect.void
      },
      delete: () => Effect.void,
    },
  }
}

const run = (cache: CacheStoreShape, sessionRepository: ReturnType<typeof createFakeSessionRepository>["repository"]) =>
  Effect.runPromise(
    resolveProjectSessionVolumeUseCase({ organizationId, projectId }).pipe(
      Effect.provideService(CacheStore, cache),
      Effect.provideService(SessionRepository, sessionRepository),
      Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId })),
    ),
  )

describe("resolveProjectSessionVolumeUseCase", () => {
  it("returns the cached volume without touching ClickHouse", async () => {
    const countByProjectId = vi.fn(() => Effect.succeed({ totalCount: 999 }))
    const { repository } = createFakeSessionRepository({ countByProjectId })

    await expect(run(makeCache("4200").store, repository)).resolves.toBe(4200)
    expect(countByProjectId).not.toHaveBeenCalled()
  })

  it("counts sessions in the window on a miss and caches the result", async () => {
    const { repository } = createFakeSessionRepository({
      countByProjectId: () => Effect.succeed({ totalCount: 12_500 }),
    })
    const cache = makeCache(null)

    await expect(run(cache.store, repository)).resolves.toBe(12_500)
    expect(cache.writes).toEqual([[`org:${organizationId}:projects:${projectId}:session-volume`, "12500"]])
  })

  it("recomputes when the cached value is not a usable count", async () => {
    const { repository } = createFakeSessionRepository({
      countByProjectId: () => Effect.succeed({ totalCount: 7 }),
    })

    await expect(run(makeCache("not-a-number").store, repository)).resolves.toBe(7)
  })

  it("degrades to null when ClickHouse fails so the caller can fall back to the floor", async () => {
    const { repository } = createFakeSessionRepository({
      countByProjectId: () =>
        Effect.fail(new RepositoryError({ cause: "clickhouse down", operation: "countByProjectId" })),
    })

    await expect(run(makeCache(null).store, repository)).resolves.toBeNull()
  })

  it("still resolves when the cache itself is unavailable", async () => {
    const { repository } = createFakeSessionRepository({
      countByProjectId: () => Effect.succeed({ totalCount: 5_000 }),
    })
    const unavailable: CacheStoreShape = {
      get: () => Effect.fail(new CacheError({ message: "redis down" })),
      set: () => Effect.void,
      delete: () => Effect.void,
    }

    await expect(run(unavailable, repository)).resolves.toBe(5_000)
  })
})
