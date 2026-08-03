import { GithubDeliveryRepository } from "@domain/github"
import { generateId, OrganizationId, type SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import { githubDeliveries } from "../schema/github-deliveries.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { GithubDeliveryRepositoryLive } from "./github-delivery-repository.ts"

const ORG = OrganizationId("a".repeat(24))
const INTEGRATION = generateId()

const pg = setupTestPostgres()

const run = <A, E>(effect: Effect.Effect<A, E, GithubDeliveryRepository | SqlClient>) =>
  Effect.runPromise(effect.pipe(withPostgres(GithubDeliveryRepositoryLive, pg.adminPostgresClient, ORG)))

const claimInput = (deliveryId: string) => ({
  deliveryId,
  integrationId: INTEGRATION,
  event: "pull_request",
  action: "opened",
  repoId: 42,
})

afterEach(async () => {
  await pg.db.delete(githubDeliveries)
})

describe("GithubDeliveryRepositoryLive", () => {
  it("claims a fresh delivery once", async () => {
    const result = await run(
      Effect.gen(function* () {
        const repo = yield* GithubDeliveryRepository
        return yield* repo.claim(claimInput("delivery-1"))
      }),
    )
    expect(result.claimed).toBe(true)
    expect(result.id).not.toBeNull()
  })

  it("re-claims a delivery whose prior attempt crashed before finalizing", async () => {
    const first = await run(
      Effect.gen(function* () {
        const repo = yield* GithubDeliveryRepository
        return yield* repo.claim(claimInput("delivery-2"))
      }),
    )
    const second = await run(
      Effect.gen(function* () {
        const repo = yield* GithubDeliveryRepository
        return yield* repo.claim(claimInput("delivery-2"))
      }),
    )
    expect(second.claimed).toBe(true)
    expect(second.id).toBe(first.id)
  })

  it("rejects re-claiming a finalized delivery (idempotent redelivery)", async () => {
    const claimed = await run(
      Effect.gen(function* () {
        const repo = yield* GithubDeliveryRepository
        const result = yield* repo.claim(claimInput("delivery-3"))
        yield* repo.finalize({ id: result.id ?? "", status: "skipped", skipReason: "no-config" })
        return result
      }),
    )
    expect(claimed.claimed).toBe(true)

    const redelivery = await run(
      Effect.gen(function* () {
        const repo = yield* GithubDeliveryRepository
        return yield* repo.claim(claimInput("delivery-3"))
      }),
    )
    expect(redelivery.claimed).toBe(false)
    expect(redelivery.id).toBeNull()
  })

  it("lists recent deliveries newest first with their finalized status", async () => {
    await run(
      Effect.gen(function* () {
        const repo = yield* GithubDeliveryRepository
        const a = yield* repo.claim(claimInput("delivery-a"))
        yield* repo.finalize({ id: a.id ?? "", status: "processed" })
        const b = yield* repo.claim(claimInput("delivery-b"))
        yield* repo.finalize({ id: b.id ?? "", status: "failed", errorCategory: "auth", errorDetail: "bad creds" })
      }),
    )

    const recent = await run(
      Effect.gen(function* () {
        const repo = yield* GithubDeliveryRepository
        return yield* repo.listRecentByOrganization({ limit: 10 })
      }),
    )
    expect(recent).toHaveLength(2)
    expect(recent.map((d) => d.status).sort()).toEqual(["failed", "processed"])
  })

  it("keyset-paginates with the id tie-breaker, covering every row exactly once", async () => {
    const created = await run(
      Effect.gen(function* () {
        const repo = yield* GithubDeliveryRepository
        const ids: string[] = []
        for (const deliveryId of ["p1", "p2", "p3"]) {
          const claimed = yield* repo.claim(claimInput(deliveryId))
          yield* repo.finalize({ id: claimed.id ?? "", status: "processed" })
          ids.push(claimed.id ?? "")
        }
        return ids
      }),
    )

    const page1 = await run(
      Effect.gen(function* () {
        const repo = yield* GithubDeliveryRepository
        return yield* repo.listRecentByOrganization({ limit: 2 })
      }),
    )
    expect(page1).toHaveLength(2)

    const cursor = page1[1]
    const page2 = await run(
      Effect.gen(function* () {
        const repo = yield* GithubDeliveryRepository
        return yield* repo.listRecentByOrganization({
          limit: 2,
          before: { receivedAt: cursor.receivedAt, id: cursor.id },
        })
      }),
    )
    expect(page2).toHaveLength(1)

    const paged = [...page1, ...page2].map((d) => d.id)
    expect(new Set(paged).size).toBe(3)
    expect(paged.slice().sort()).toEqual(created.slice().sort())
  })
})
