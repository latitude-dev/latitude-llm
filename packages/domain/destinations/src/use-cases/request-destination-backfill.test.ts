import { QueuePublishError } from "@domain/queue"
import { DestinationId, OrganizationId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { type DestinationSource, defaultSourceConfig } from "../entities/destination-source.ts"
import { createDestinationSourceState } from "../entities/destination-source-state.ts"
import { DestinationRetentionPolicy } from "../ports/destination-retention-policy.ts"
import { DestinationSourceStateRepository } from "../ports/destination-source-state-repository.ts"
import { createFakeRetentionPolicy } from "../testing/fake-destination-retention-policy.ts"
import { createFakeDestinationSourceStateRepository } from "../testing/fake-destination-source-state-repository.ts"
import { requestDestinationBackfillUseCase } from "./request-destination-backfill.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")
const ORG_ID = OrganizationId(cuid("o"))
const DESTINATION_ID = DestinationId(cuid("d"))
const SOURCE: DestinationSource = "spans"
const NOW = new Date("2026-06-18T00:00:00.000Z")
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // retention floor = 2026-05-19
const COVERAGE_START = new Date("2026-06-01T00:00:00.000Z") // above the floor → backfill has work

const layerWith = (status: "enabled" | "disabled", coverageStartAt: Date = COVERAGE_START) => {
  const { repo } = createFakeDestinationSourceStateRepository([
    createDestinationSourceState({
      organizationId: ORG_ID,
      destinationId: DESTINATION_ID,
      source: SOURCE,
      config: defaultSourceConfig(SOURCE),
      status,
      watermark: coverageStartAt,
    }),
  ])
  return Layer.mergeAll(
    Layer.succeed(DestinationSourceStateRepository, repo),
    Layer.succeed(DestinationRetentionPolicy, createFakeRetentionPolicy(MAX_AGE_MS)),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
  )
}

describe("requestDestinationBackfillUseCase", () => {
  it("enqueues one job per enabled source, bounding `until` at the source's coverage start", async () => {
    const jobs: { source: DestinationSource; since: Date | null; until: Date }[] = []
    const since = new Date("2026-05-20T00:00:00.000Z")

    const result = await Effect.runPromise(
      requestDestinationBackfillUseCase({
        destinationId: DESTINATION_ID,
        since,
        now: NOW,
        publish: (job) => Effect.sync(() => jobs.push(job)),
      }).pipe(Effect.provide(layerWith("enabled"))),
    )

    expect(result).toEqual({ requested: 1, enqueued: 1, failed: 0 })
    expect(jobs).toEqual([{ source: SOURCE, since, until: COVERAGE_START }])
  })

  it("passes `since: null` through (worker resolves the retention floor)", async () => {
    const jobs: { source: DestinationSource; since: Date | null; until: Date }[] = []

    await Effect.runPromise(
      requestDestinationBackfillUseCase({
        destinationId: DESTINATION_ID,
        since: null,
        now: NOW,
        publish: (job) => Effect.sync(() => jobs.push(job)),
      }).pipe(Effect.provide(layerWith("enabled"))),
    )

    expect(jobs).toEqual([{ source: SOURCE, since: null, until: COVERAGE_START }])
  })

  it("skips disabled sources", async () => {
    const jobs: unknown[] = []

    const result = await Effect.runPromise(
      requestDestinationBackfillUseCase({
        destinationId: DESTINATION_ID,
        since: null,
        now: NOW,
        publish: (job) => Effect.sync(() => jobs.push(job)),
      }).pipe(Effect.provide(layerWith("disabled"))),
    )

    expect(result).toEqual({ requested: 0, enqueued: 0, failed: 0 })
    expect(jobs).toHaveLength(0)
  })

  it("skips a source already imported to the retention floor (nothing to backfill)", async () => {
    const jobs: unknown[] = []
    const atFloor = new Date("2026-04-01T00:00:00.000Z") // below the 05-19 floor → no history left

    const result = await Effect.runPromise(
      requestDestinationBackfillUseCase({
        destinationId: DESTINATION_ID,
        since: null,
        now: NOW,
        publish: (job) => Effect.sync(() => jobs.push(job)),
      }).pipe(Effect.provide(layerWith("enabled", atFloor))),
    )

    expect(result).toEqual({ requested: 0, enqueued: 0, failed: 0 })
    expect(jobs).toHaveLength(0)
  })

  it("tallies per-source publish failures without failing the fan-out", async () => {
    const result = await Effect.runPromise(
      requestDestinationBackfillUseCase({
        destinationId: DESTINATION_ID,
        since: null,
        now: NOW,
        publish: () => Effect.fail(new QueuePublishError({ cause: "boom", queue: "destinations" })),
      }).pipe(Effect.provide(layerWith("enabled"))),
    )

    expect(result).toEqual({ requested: 1, enqueued: 0, failed: 1 })
  })
})
