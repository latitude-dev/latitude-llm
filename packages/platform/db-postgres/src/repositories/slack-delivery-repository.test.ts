import { SlackDeliveryRepository } from "@domain/integrations"
import { generateId, OrganizationId, SlackIntegrationId, type SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import { slackDeliveries } from "../schema/slack-deliveries.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { SlackDeliveryRepositoryLive } from "./slack-delivery-repository.ts"

const ORG = OrganizationId("a".repeat(24))
const INTEGRATION = SlackIntegrationId(generateId())

const pg = setupTestPostgres()

const run = <A, E>(effect: Effect.Effect<A, E, SlackDeliveryRepository | SqlClient>) =>
  Effect.runPromise(effect.pipe(withPostgres(SlackDeliveryRepositoryLive, pg.adminPostgresClient, ORG)))

afterEach(async () => {
  await pg.db.delete(slackDeliveries)
})

describe("SlackDeliveryRepositoryLive", () => {
  it("claims a row exactly once for (idempotencyKey, channelId)", async () => {
    const first = await run(
      Effect.gen(function* () {
        const repo = yield* SlackDeliveryRepository
        return yield* repo.claim({
          integrationId: INTEGRATION,
          idempotencyKey: "k1",
          channelId: "C111",
        })
      }),
    )

    const second = await run(
      Effect.gen(function* () {
        const repo = yield* SlackDeliveryRepository
        return yield* repo.claim({
          integrationId: INTEGRATION,
          idempotencyKey: "k1",
          channelId: "C111",
        })
      }),
    )

    expect(first.claimed).toBe(true)
    expect(first.deliveryId).not.toBeNull()
    expect(second.claimed).toBe(false)
    expect(second.deliveryId).toBeNull()
  })

  it("treats different (idempotencyKey, channelId) pairs as independent", async () => {
    const a = await run(
      Effect.gen(function* () {
        const repo = yield* SlackDeliveryRepository
        return yield* repo.claim({
          integrationId: INTEGRATION,
          idempotencyKey: "k2",
          channelId: "C111",
        })
      }),
    )
    const b = await run(
      Effect.gen(function* () {
        const repo = yield* SlackDeliveryRepository
        return yield* repo.claim({
          integrationId: INTEGRATION,
          idempotencyKey: "k2",
          channelId: "C222",
        })
      }),
    )

    expect(a.claimed).toBe(true)
    expect(b.claimed).toBe(true)
    expect(a.deliveryId).not.toEqual(b.deliveryId)
  })

  it("stamps posted_at + message_ts on markPosted", async () => {
    const claim = await run(
      Effect.gen(function* () {
        const repo = yield* SlackDeliveryRepository
        return yield* repo.claim({
          integrationId: INTEGRATION,
          idempotencyKey: "k3",
          channelId: "C333",
        })
      }),
    )
    expect(claim.claimed).toBe(true)
    if (!claim.claimed || claim.deliveryId === null) throw new Error("unreachable")

    const marked = await run(
      Effect.gen(function* () {
        const repo = yield* SlackDeliveryRepository
        if (claim.deliveryId === null) throw new Error("unreachable")
        return yield* repo.markPosted(claim.deliveryId, "1700000000.000999")
      }),
    )
    expect(marked).toBe(true)
  })
})
