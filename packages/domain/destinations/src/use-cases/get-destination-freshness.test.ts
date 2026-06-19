import { ChSqlClient, DestinationId, OrganizationId, ProjectId, SqlClient, UserId } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { POSTHOG_US_INGESTION_HOST } from "../constants.ts"
import { createDestination, type Destination } from "../entities/destination.ts"
import type { DestinationSourceConfig } from "../entities/destination-source.ts"
import { createDestinationSourceState, type DestinationSourceState } from "../entities/destination-source-state.ts"
import { DestinationRepository } from "../ports/destination-repository.ts"
import { DestinationRetentionPolicy } from "../ports/destination-retention-policy.ts"
import { DestinationSourceReaders, type SourceCursor } from "../ports/destination-source-reader.ts"
import { DestinationSourceStateRepository } from "../ports/destination-source-state-repository.ts"
import { createFakeDestinationRepository } from "../testing/fake-destination-repository.ts"
import { createFakeRetentionPolicy } from "../testing/fake-destination-retention-policy.ts"
import { fakeSourceReaderRegistry, staticSourceReader } from "../testing/fake-destination-source-reader.ts"
import { createFakeDestinationSourceStateRepository } from "../testing/fake-destination-source-state-repository.ts"
import { getDestinationFreshnessUseCase } from "./get-destination-freshness.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")
const orgId = OrganizationId(cuid("o"))
const projectId = ProjectId(cuid("p"))
const destinationId = DestinationId(cuid("d"))
const userId = UserId(cuid("u"))
const now = new Date("2026-06-17T12:00:00.000Z")
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // retention floor = now − 30d

const spansConfig: DestinationSourceConfig = { source: "spans", excludePayloads: false, maxRecordsPerRun: 50_000 }

const destination = (overrides: Partial<Destination> = {}): Destination => ({
  ...createDestination({
    id: destinationId,
    organizationId: orgId,
    projectId,
    name: "Acme PostHog",
    config: { kind: "posthog", host: POSTHOG_US_INGESTION_HOST, intervalMs: 300_000 },
    credentials: { kind: "posthog", apiKey: "phc_test" },
    createdByUserId: userId,
  }),
  ...overrides,
})

const cursor = (
  status: DestinationSourceState["status"] = "enabled",
  // coverageStartAt is initialized to the watermark — recent by default (above the floor).
  watermark: Date = new Date(now.getTime() - 31 * 60_000),
): DestinationSourceState =>
  createDestinationSourceState({
    organizationId: orgId,
    destinationId,
    source: "spans",
    config: spansConfig,
    status,
    watermark,
  })

const setup = (opts: { seed?: Destination; cursor?: DestinationSourceState; nextCursor?: SourceCursor | null }) => {
  const { repo: destinationRepo, rows } = createFakeDestinationRepository([opts.seed ?? destination()])
  const { repo: cursorRepo } = createFakeDestinationSourceStateRepository([opts.cursor ?? cursor()], rows)
  const reader = staticSourceReader({ records: [], nextCursor: opts.nextCursor ?? null })
  const layer = Layer.mergeAll(
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
    Layer.succeed(ChSqlClient, createFakeChSqlClient()),
    Layer.succeed(DestinationRepository, destinationRepo),
    Layer.succeed(DestinationSourceStateRepository, cursorRepo),
    Layer.succeed(DestinationSourceReaders, fakeSourceReaderRegistry(reader)),
    Layer.succeed(DestinationRetentionPolicy, createFakeRetentionPolicy(MAX_AGE_MS)),
  )
  return { layer }
}

const run = (
  layer: Layer.Layer<
    | SqlClient
    | ChSqlClient
    | DestinationRepository
    | DestinationSourceStateRepository
    | DestinationSourceReaders
    | DestinationRetentionPolicy
  >,
) =>
  Effect.runPromise(
    getDestinationFreshnessUseCase({ organizationId: orgId, projectId, destinationId, now }).pipe(
      Effect.provide(layer),
    ),
  )

describe("getDestinationFreshnessUseCase", () => {
  it("caught up (reader returns no pending record) → source lag null = Up to date", async () => {
    const { layer } = setup({ nextCursor: null })
    expect((await run(layer)).sources).toEqual([{ source: "spans", lagMs: null }])
  })

  it("backlog → lagMs = now − oldest pending record (not now − watermark)", async () => {
    // Watermark is 31 min behind (idle-backoff artifact), but the oldest undelivered record is only 4 min old.
    const oldestPending: SourceCursor = { watermark: new Date(now.getTime() - 4 * 60_000), id: "span1" }
    const { layer } = setup({ nextCursor: oldestPending })
    expect((await run(layer)).sources).toEqual([{ source: "spans", lagMs: 4 * 60_000 }])
  })

  it("disabled source is not read → omitted (no entry)", async () => {
    // nextCursor would report a backlog, but a disabled source must be skipped entirely.
    const { layer } = setup({ cursor: cursor("disabled"), nextCursor: { watermark: now, id: "x" } })
    expect((await run(layer)).sources).toEqual([])
  })

  it("backfillAvailable=true when an enabled source's coverage starts above the retention floor", async () => {
    const { layer } = setup({ nextCursor: null }) // default cursor: coverage 31min ago, above the 30d floor
    expect((await run(layer)).backfillAvailable).toBe(true)
  })

  it("backfillAvailable=false once coverage has reached the retention floor (nothing left to import)", async () => {
    const belowFloor = new Date(now.getTime() - (MAX_AGE_MS + 24 * 60 * 60 * 1000)) // older than the floor
    const { layer } = setup({ cursor: cursor("enabled", belowFloor), nextCursor: null })
    expect((await run(layer)).backfillAvailable).toBe(false)
  })

  it("reports backfillProgress (~0.5) for an in-flight backfill at the range midpoint", async () => {
    const coverageStartAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000) // rangeEnd = now − 10d
    const floor = now.getTime() - MAX_AGE_MS // rangeStart = now − 30d
    const midpoint = new Date((floor + coverageStartAt.getTime()) / 2)
    const source = {
      ...cursor("enabled", coverageStartAt), // watermark seeds coverage_start_at = rangeEnd
      backfillStartedAt: new Date(now.getTime() - 60_000),
      backfillProgressAt: midpoint,
    }
    const { layer } = setup({ cursor: source, nextCursor: null })

    const freshness = await run(layer)
    expect(freshness.backfillProgress).toBeCloseTo(0.5, 1)
    expect(freshness.backfillInProgress).toBe(true)
  })

  it("backfillProgress is null + backfillInProgress false when no backfill is in flight", async () => {
    const { layer } = setup({ nextCursor: null })
    const freshness = await run(layer)
    expect(freshness.backfillProgress).toBeNull()
    expect(freshness.backfillInProgress).toBe(false)
  })

  it("treats a stale-heartbeat chain as wedged → not in progress", async () => {
    const coverageStartAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
    const source = {
      ...cursor("enabled", coverageStartAt),
      backfillStartedAt: new Date(now.getTime() - 60_000),
      backfillProgressAt: coverageStartAt,
      updatedAt: new Date(now.getTime() - 10 * 60_000), // heartbeat older than the 5-min stale threshold
    }
    const { layer } = setup({ cursor: source, nextCursor: null })

    const freshness = await run(layer)
    expect(freshness.backfillInProgress).toBe(false)
    expect(freshness.backfillProgress).toBeNull()
  })

  it("rejects a destination from another project", async () => {
    const { layer } = setup({ seed: destination({ projectId: ProjectId(cuid("other")) }) })
    await expect(run(layer)).rejects.toThrow()
  })
})
