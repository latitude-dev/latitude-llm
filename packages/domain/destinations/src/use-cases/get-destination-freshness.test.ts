import { ChSqlClient, DestinationId, OrganizationId, ProjectId, SqlClient, UserId } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { POSTHOG_US_INGESTION_HOST } from "../constants.ts"
import { createDestination, type Destination } from "../entities/destination.ts"
import type { DestinationSourceConfig } from "../entities/destination-source.ts"
import { createDestinationSourceState, type DestinationSourceState } from "../entities/destination-source-state.ts"
import { DestinationRepository } from "../ports/destination-repository.ts"
import { DestinationSourceReaders, type SourceCursor } from "../ports/destination-source-reader.ts"
import { DestinationSourceStateRepository } from "../ports/destination-source-state-repository.ts"
import { createFakeDestinationRepository } from "../testing/fake-destination-repository.ts"
import { fakeSourceReaderRegistry, staticSourceReader } from "../testing/fake-destination-source-reader.ts"
import { createFakeDestinationSourceStateRepository } from "../testing/fake-destination-source-state-repository.ts"
import { getDestinationFreshnessUseCase } from "./get-destination-freshness.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")
const orgId = OrganizationId(cuid("o"))
const projectId = ProjectId(cuid("p"))
const destinationId = DestinationId(cuid("d"))
const userId = UserId(cuid("u"))
const now = new Date("2026-06-17T12:00:00.000Z")

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

const cursor = (status: DestinationSourceState["status"] = "enabled"): DestinationSourceState =>
  createDestinationSourceState({
    organizationId: orgId,
    destinationId,
    source: "spans",
    config: spansConfig,
    status,
    watermark: new Date(now.getTime() - 31 * 60_000),
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
  )
  return { layer }
}

const run = (
  layer: Layer.Layer<
    SqlClient | ChSqlClient | DestinationRepository | DestinationSourceStateRepository | DestinationSourceReaders
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

  it("rejects a destination from another project", async () => {
    const { layer } = setup({ seed: destination({ projectId: ProjectId(cuid("other")) }) })
    await expect(run(layer)).rejects.toThrow()
  })
})
