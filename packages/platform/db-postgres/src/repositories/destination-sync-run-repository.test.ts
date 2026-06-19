import { createDestinationSyncRun, type DestinationSyncRun, DestinationSyncRunRepository } from "@domain/destinations"
import { DestinationId, DestinationSyncRunId, OrganizationId, type SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import { destinationSyncRuns } from "../schema/destination-sync-runs.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { DestinationSyncRunRepositoryLive } from "./destination-sync-run-repository.ts"

const ORG_A = OrganizationId("a".repeat(24))
const ORG_B = OrganizationId("b".repeat(24))
const DESTINATION_A = DestinationId("d".repeat(24))
const DESTINATION_B = DestinationId("e".repeat(24))

const pg = setupTestPostgres()

const runWithLive = <A, E>(
  effect: Effect.Effect<A, E, DestinationSyncRunRepository | SqlClient>,
  org: OrganizationId = ORG_A,
) => Effect.runPromise(effect.pipe(withPostgres(DestinationSyncRunRepositoryLive, pg.adminPostgresClient, org)))

const makeRun = (overrides: Partial<Omit<DestinationSyncRun, "createdAt" | "updatedAt">> = {}): DestinationSyncRun => {
  const startedAt = overrides.startedAt ?? new Date("2026-06-12T12:00:00.000Z")
  return createDestinationSyncRun({
    organizationId: ORG_A,
    destinationId: DESTINATION_A,
    source: "spans",
    windowStart: new Date(startedAt.getTime() - 300_000),
    windowEnd: startedAt,
    status: "succeeded",
    recordsRead: 120,
    eventsSent: 130,
    eventsDropped: 0,
    error: null,
    startedAt,
    finishedAt: new Date(startedAt.getTime() + 2_000),
    ...overrides,
  })
}

const insert = (run: DestinationSyncRun, org: OrganizationId = ORG_A) =>
  runWithLive(
    Effect.gen(function* () {
      const repo = yield* DestinationSyncRunRepository
      yield* repo.insert(run)
    }),
    org,
  )

afterEach(async () => {
  await pg.db.delete(destinationSyncRuns)
})

describe("DestinationSyncRunRepositoryLive", () => {
  it("round-trips a run and lists newest-first with a limit", async () => {
    const at = (iso: string) => new Date(iso)
    const oldest = makeRun({ startedAt: at("2026-06-12T10:00:00.000Z") })
    const middle = makeRun({
      startedAt: at("2026-06-12T11:00:00.000Z"),
      status: "failed",
      recordsRead: 50_000,
      eventsSent: 0,
      eventsDropped: 0,
      error: "posthog: HTTP 429 (retryable, retries exhausted)",
    })
    const newest = makeRun({
      startedAt: at("2026-06-12T12:00:00.000Z"),
      eventsDropped: 2,
    })
    const otherDestination = makeRun({
      destinationId: DESTINATION_B,
      startedAt: at("2026-06-12T12:30:00.000Z"),
    })

    await insert(oldest)
    await insert(middle)
    await insert(newest)
    await insert(otherDestination)

    const runs = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* DestinationSyncRunRepository
        return yield* repo.listByDestinationId({
          destinationId: DESTINATION_A,
          limit: 2,
        })
      }),
    )

    expect(runs.map((r) => r.id)).toEqual([newest.id, middle.id])
    expect(runs[0]).toEqual(newest)
    expect(runs[1]?.error).toBe("posthog: HTTP 429 (retryable, retries exhausted)")
  })

  it("round-trips the backfill trigger", async () => {
    const live = makeRun({ startedAt: new Date("2026-06-12T11:00:00.000Z") })
    const backfill = makeRun({ trigger: "backfill", startedAt: new Date("2026-06-12T12:00:00.000Z") })
    await insert(live)
    await insert(backfill)

    const runs = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* DestinationSyncRunRepository
        return yield* repo.listByDestinationId({ destinationId: DESTINATION_A, limit: 10 })
      }),
    )

    expect(runs.map((r) => r.trigger)).toEqual(["backfill", "live"])
  })

  it("keyset-paginates with a stable id tie-breaker across same-startedAt runs", async () => {
    // Three runs share one startedAt; one is older. (started_at DESC, id DESC)
    // must page through all four without skipping or repeating a sibling.
    const shared = new Date("2026-06-12T12:00:00.000Z")
    const older = makeRun({
      id: DestinationSyncRunId("0".repeat(24)),
      startedAt: new Date("2026-06-12T11:00:00.000Z"),
    })
    const tieLow = makeRun({
      id: DestinationSyncRunId(`${"a".repeat(23)}1`),
      startedAt: shared,
    })
    const tieMid = makeRun({
      id: DestinationSyncRunId(`${"a".repeat(23)}2`),
      startedAt: shared,
    })
    const tieHigh = makeRun({
      id: DestinationSyncRunId(`${"a".repeat(23)}3`),
      startedAt: shared,
    })

    for (const run of [older, tieLow, tieMid, tieHigh]) await insert(run)

    const expectedOrder = [tieHigh.id, tieMid.id, tieLow.id, older.id]

    const page1 = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* DestinationSyncRunRepository
        return yield* repo.listByDestinationId({
          destinationId: DESTINATION_A,
          limit: 2,
        })
      }),
    )
    expect(page1.map((r) => r.id)).toEqual(expectedOrder.slice(0, 2))

    const cursorRow = page1[page1.length - 1]
    const page2 = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* DestinationSyncRunRepository
        return yield* repo.listByDestinationId({
          destinationId: DESTINATION_A,
          limit: 2,
          before: { startedAt: cursorRow.startedAt, id: cursorRow.id },
        })
      }),
    )
    expect(page2.map((r) => r.id)).toEqual(expectedOrder.slice(2, 4))
  })

  it("deleteByDestinationIds removes only the given destinations' runs and tolerates an empty list", async () => {
    const runA = makeRun()
    const runB = makeRun({ destinationId: DESTINATION_B })
    await insert(runA)
    await insert(runB)

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* DestinationSyncRunRepository
        yield* repo.deleteByDestinationIds([])
        yield* repo.deleteByDestinationIds([DESTINATION_A])
      }),
    )

    const remaining = await pg.db.select({ id: destinationSyncRuns.id }).from(destinationSyncRuns)
    expect(remaining.map((r) => r.id)).toEqual([runB.id])
  })

  it("pruneFinishedBefore deletes old runs across orgs and returns the pruned count", async () => {
    const cutoff = new Date("2026-06-12T00:00:00.000Z")
    const oldOrgA = makeRun({
      startedAt: new Date("2026-05-01T10:00:00.000Z"),
    })
    const oldOrgB = makeRun({
      organizationId: ORG_B,
      destinationId: DESTINATION_B,
      startedAt: new Date("2026-05-02T10:00:00.000Z"),
    })
    const recent = makeRun({ startedAt: new Date("2026-06-12T10:00:00.000Z") })

    await insert(oldOrgA)
    await insert(oldOrgB, ORG_B)
    await insert(recent)

    const pruned = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* DestinationSyncRunRepository
        return yield* repo.pruneFinishedBefore(cutoff)
      }),
    )

    expect(pruned).toBe(2)
    const remaining = await pg.db.select({ id: destinationSyncRuns.id }).from(destinationSyncRuns)
    expect(remaining.map((r) => r.id)).toEqual([recent.id])
  })
})
