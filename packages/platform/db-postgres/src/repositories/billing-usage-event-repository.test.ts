import { type BillingUsageEvent, BillingUsageEventRepository } from "@domain/billing"
import { OrganizationId, ProjectId, type SqlClient, TraceId } from "@domain/shared"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { billingUsageEvents } from "../schema/billing.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { BillingUsageEventRepositoryLive } from "./billing-usage-event-repository.ts"

const ORGANIZATION_ID = OrganizationId("o".repeat(24))
const PROJECT_ID = ProjectId("p".repeat(24))
const now = new Date()
const PERIOD_START = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
const PERIOD_END = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
const NEXT_PERIOD_START = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
const NEXT_PERIOD_END = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1))

const pg = setupTestPostgres()

const runWithLive = <A, E>(effect: Effect.Effect<A, E, BillingUsageEventRepository | SqlClient>) =>
  Effect.runPromise(effect.pipe(withPostgres(BillingUsageEventRepositoryLive, pg.adminPostgresClient, ORGANIZATION_ID)))

const makeEvent = (input: {
  readonly id: string
  readonly idempotencyKey: string
  readonly billingPeriodStart?: Date
  readonly billingPeriodEnd?: Date
}): BillingUsageEvent => ({
  id: input.id,
  organizationId: ORGANIZATION_ID,
  projectId: PROJECT_ID,
  action: "trace",
  credits: 1,
  idempotencyKey: input.idempotencyKey,
  traceId: TraceId(input.id.padEnd(32, "0").slice(0, 32)),
  metadata: undefined,
  happenedAt: new Date(),
  billingPeriodStart: input.billingPeriodStart ?? PERIOD_START,
  billingPeriodEnd: input.billingPeriodEnd ?? PERIOD_END,
})

describe("BillingUsageEventRepositoryLive", () => {
  beforeEach(async () => {
    await pg.db.delete(billingUsageEvents)
  })

  it("dedupes by billing period and idempotency key in the partitioned event ledger", async () => {
    const first = makeEvent({ id: "a".repeat(24), idempotencyKey: "trace:org:project:a" })
    const duplicate = makeEvent({ id: "b".repeat(24), idempotencyKey: first.idempotencyKey })
    const second = makeEvent({ id: "c".repeat(24), idempotencyKey: "trace:org:project:c" })

    const inserted = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* BillingUsageEventRepository
        return yield* repo.insertMany([first, duplicate, second])
      }),
    )

    expect(inserted).toBe(2)

    const retryInserted = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* BillingUsageEventRepository
        return yield* repo.insertIfAbsent(duplicate)
      }),
    )

    expect(retryInserted).toBe(false)

    const found = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* BillingUsageEventRepository
        return yield* repo.findOptionalByKey(first.idempotencyKey)
      }),
    )

    expect(found?.id).toBe(first.id)
    expect(await pg.db.select().from(billingUsageEvents)).toHaveLength(2)
  })

  it("allows an idempotency key to be reused in a different billing period", async () => {
    const first = makeEvent({ id: "d".repeat(24), idempotencyKey: "trace:org:project:periodic" })
    const nextPeriod = makeEvent({
      id: "e".repeat(24),
      idempotencyKey: first.idempotencyKey,
      billingPeriodStart: NEXT_PERIOD_START,
      billingPeriodEnd: NEXT_PERIOD_END,
    })

    const results = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* BillingUsageEventRepository
        return [yield* repo.insertIfAbsent(first), yield* repo.insertIfAbsent(nextPeriod)]
      }),
    )

    expect(results).toEqual([true, true])
    expect(await pg.db.select().from(billingUsageEvents)).toHaveLength(2)
  })
})
