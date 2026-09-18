import { type BillingUsageEvent, BillingUsageEventRepository } from "@domain/billing"
import { OrganizationId, ProjectId, type SqlClient, TraceId } from "@domain/shared"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { billingUsageEvents } from "../schema/billing.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { BillingUsageEventRepositoryLive, dedupeAndOrderEventsForInsert } from "./billing-usage-event-repository.ts"

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
  readonly projectId?: ProjectId
  readonly action?: BillingUsageEvent["action"]
  readonly credits?: number
}): BillingUsageEvent => ({
  id: input.id,
  organizationId: ORGANIZATION_ID,
  projectId: input.projectId ?? PROJECT_ID,
  action: input.action ?? "trace",
  credits: input.credits ?? 1,
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

  // Concurrent same-period batches are written by multiple worker processes
  // (the in-memory batcher only dedupes within one process). When two such
  // batches shared idempotency keys but supplied them in different arrival
  // orders, the multi-row `INSERT ... ON CONFLICT` acquired the unique-index
  // locks in opposite orders and deadlocked. `insertMany` must therefore emit
  // rows in a deterministic order keyed on the conflict tuple regardless of
  // input order, so every transaction takes the locks in the same order.
  it("orders events deterministically by (billingPeriodStart, idempotencyKey) regardless of input order", () => {
    const a = makeEvent({ id: "a".repeat(24), idempotencyKey: "trace:org:project:a" })
    const b = makeEvent({ id: "b".repeat(24), idempotencyKey: "trace:org:project:b" })
    const c = makeEvent({ id: "c".repeat(24), idempotencyKey: "trace:org:project:c" })

    const keysOf = (events: readonly BillingUsageEvent[]) => events.map((event) => event.idempotencyKey)
    const expected = ["trace:org:project:a", "trace:org:project:b", "trace:org:project:c"]

    // Two batches with the same keys in opposite arrival orders must converge
    // to the identical insert order — this is the property that breaks the
    // AB/BA deadlock cycle.
    expect(keysOf(dedupeAndOrderEventsForInsert([c, a, b]))).toEqual(expected)
    expect(keysOf(dedupeAndOrderEventsForInsert([b, c, a]))).toEqual(expected)
    expect(keysOf(dedupeAndOrderEventsForInsert([a, b, c]))).toEqual(expected)
  })

  it("orders by billing period before idempotency key, and still dedupes per period", () => {
    const nextPeriodEarlyKey = makeEvent({
      id: "x".repeat(24),
      idempotencyKey: "trace:org:project:a",
      billingPeriodStart: NEXT_PERIOD_START,
      billingPeriodEnd: NEXT_PERIOD_END,
    })
    const thisPeriodLateKey = makeEvent({ id: "y".repeat(24), idempotencyKey: "trace:org:project:z" })
    const thisPeriodLateKeyDuplicate = makeEvent({ id: "z".repeat(24), idempotencyKey: "trace:org:project:z" })

    const ordered = dedupeAndOrderEventsForInsert([nextPeriodEarlyKey, thisPeriodLateKeyDuplicate, thisPeriodLateKey])

    // Earlier period sorts first even though its idempotency key sorts later;
    // the duplicate within the later period collapses to a single row.
    expect(ordered.map((event) => event.idempotencyKey)).toEqual(["trace:org:project:z", "trace:org:project:a"])
    expect(ordered.map((event) => event.billingPeriodStart.getTime())).toEqual([
      PERIOD_START.getTime(),
      NEXT_PERIOD_START.getTime(),
    ])
  })

  it("persists the identical ledger when the same keys arrive in opposite batch orders", async () => {
    const a = makeEvent({ id: "a".repeat(24), idempotencyKey: "trace:org:project:a" })
    const b = makeEvent({ id: "b".repeat(24), idempotencyKey: "trace:org:project:b" })
    const c = makeEvent({ id: "c".repeat(24), idempotencyKey: "trace:org:project:c" })

    const insertedForward = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* BillingUsageEventRepository
        return yield* repo.insertMany([a, b, c])
      }),
    )
    expect(insertedForward).toBe(3)

    // A concurrent batch carrying the same keys in reverse must be a no-op
    // (all conflicts), not a second set of rows.
    const insertedReverse = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* BillingUsageEventRepository
        return yield* repo.insertMany([c, b, a])
      }),
    )
    expect(insertedReverse).toBe(0)
    expect(await pg.db.select().from(billingUsageEvents)).toHaveLength(3)
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
  it("summarizes a period's credits per project, action, and metering label", async () => {
    const otherProject = ProjectId("q".repeat(24))
    const events = [
      makeEvent({ id: "a".repeat(24), idempotencyKey: "trace:org:project:a" }),
      makeEvent({ id: "b".repeat(24), idempotencyKey: "trace:org:project:b" }),
      makeEvent({ id: "c".repeat(24), idempotencyKey: "eval-scan:org:eval:c", action: "eval-scan" }),
      makeEvent({
        id: "d".repeat(24),
        idempotencyKey: "llm-call:org:live-eval:eval:d:0",
        action: "llm-call",
        credits: 4,
      }),
      makeEvent({
        id: "e".repeat(24),
        idempotencyKey: "llm-call:org:live-eval:eval:d:1",
        action: "llm-call",
        credits: 6,
      }),
      makeEvent({
        id: "f".repeat(24),
        idempotencyKey: "semantic-query:org:live-eval:eval:d:2",
        action: "semantic-query",
        credits: 1,
      }),
      makeEvent({
        id: "g".repeat(24),
        idempotencyKey: "llm-call:org:signal-refresh:sig:g:0",
        action: "llm-call",
        credits: 9,
        projectId: otherProject,
      }),
      makeEvent({
        id: "h".repeat(24),
        idempotencyKey: "trace:org:project:h",
        billingPeriodStart: NEXT_PERIOD_START,
        billingPeriodEnd: NEXT_PERIOD_END,
      }),
    ]

    const rows = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* BillingUsageEventRepository
        yield* repo.insertMany(events)
        return yield* repo.summarizeByPeriod({
          organizationId: ORGANIZATION_ID,
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
        })
      }),
    )

    expect(rows).toHaveLength(5)
    expect(rows).toEqual(
      expect.arrayContaining([
        { projectId: PROJECT_ID, action: "trace", meteringLabel: null, credits: 2 },
        { projectId: PROJECT_ID, action: "eval-scan", meteringLabel: null, credits: 1 },
        { projectId: PROJECT_ID, action: "llm-call", meteringLabel: "live-eval", credits: 10 },
        { projectId: PROJECT_ID, action: "semantic-query", meteringLabel: "live-eval", credits: 1 },
        { projectId: otherProject, action: "llm-call", meteringLabel: "signal-refresh", credits: 9 },
      ]),
    )
  })
})
