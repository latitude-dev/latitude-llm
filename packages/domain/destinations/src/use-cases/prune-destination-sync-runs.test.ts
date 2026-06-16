import { type DestinationId, OrganizationId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { DESTINATION_SYNC_RUN_RETENTION_MS } from "../constants.ts"
import { createDestinationSyncRun, type DestinationSyncRun } from "../entities/destination-sync-run.ts"
import { DestinationSyncRunRepository } from "../ports/destination-sync-run-repository.ts"
import { createFakeDestinationSyncRunRepository } from "../testing/fake-destination-sync-run-repository.ts"
import { pruneDestinationSyncRunsUseCase } from "./prune-destination-sync-runs.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")
const NOW = new Date("2026-06-01T12:00:00.000Z")

const makeSyncRun = (destinationId: string, finishedAt: Date): DestinationSyncRun =>
  createDestinationSyncRun({
    organizationId: OrganizationId(cuid("o")),
    destinationId: destinationId as DestinationId,
    windowStart: finishedAt,
    windowEnd: finishedAt,
    status: "succeeded",
    spansRead: 0,
    eventsSent: 0,
    eventsDropped: 0,
    error: null,
    startedAt: finishedAt,
    finishedAt,
  })

const run = (seed: readonly DestinationSyncRun[]) =>
  Effect.gen(function* () {
    const { repo, rows } = createFakeDestinationSyncRunRepository(seed)
    const layer = Layer.mergeAll(
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId("system") })),
      Layer.succeed(DestinationSyncRunRepository, repo),
    )
    const result = yield* pruneDestinationSyncRunsUseCase({ now: NOW }).pipe(Effect.provide(layer))
    return { result, rows }
  })

describe("pruneDestinationSyncRunsUseCase", () => {
  it("deletes runs finished before the retention cutoff and keeps fresher ones", async () => {
    const cutoff = new Date(NOW.getTime() - DESTINATION_SYNC_RUN_RETENTION_MS)
    const old = new Date(cutoff.getTime() - 1_000)
    const fresh = new Date(cutoff.getTime() + 1_000)

    const { result, rows } = await Effect.runPromise(
      run([makeSyncRun(cuid("d1"), old), makeSyncRun(cuid("d2"), fresh)]),
    )

    expect(result.pruned).toBe(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.finishedAt).toEqual(fresh)
  })

  it("prunes nothing when every run is within retention", async () => {
    const fresh = new Date(NOW.getTime() - 1_000)
    const { result, rows } = await Effect.runPromise(run([makeSyncRun(cuid("d1"), fresh)]))

    expect(result.pruned).toBe(0)
    expect(rows).toHaveLength(1)
  })
})
