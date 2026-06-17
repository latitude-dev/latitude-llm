import { DestinationId, OrganizationId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { defaultSourceConfig } from "../entities/destination-source.ts"
import { createDestinationSourceState } from "../entities/destination-source-state.ts"
import { DestinationSourceStateRepository } from "../ports/destination-source-state-repository.ts"
import { DestinationSyncRunRepository } from "../ports/destination-sync-run-repository.ts"
import { createFakeDestinationSourceStateRepository } from "../testing/fake-destination-source-state-repository.ts"
import { createFakeDestinationSyncRunRepository } from "../testing/fake-destination-sync-run-repository.ts"
import { recordBackfillFailureUseCase } from "./record-backfill-failure.ts"

const cuid = (s: string) => s.padEnd(24, "0")
const ORG = OrganizationId(cuid("o"))
const DEST = DestinationId(cuid("d"))
const NOW = new Date("2026-06-01T12:00:00.000Z")

describe("recordBackfillFailureUseCase", () => {
  it("writes a failed backfill run row (visible in history) and clears the in-flight marker", async () => {
    const state = {
      ...createDestinationSourceState({
        organizationId: ORG,
        destinationId: DEST,
        source: "spans",
        config: defaultSourceConfig("spans"),
        watermark: NOW,
      }),
      backfillStartedAt: NOW,
    }
    const { repo: stateRepo, rows: stateRows } = createFakeDestinationSourceStateRepository([state])
    const { repo: syncRunRepo, rows: syncRunRows } = createFakeDestinationSyncRunRepository()
    const layer = Layer.mergeAll(
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG })),
      Layer.succeed(DestinationSourceStateRepository, stateRepo),
      Layer.succeed(DestinationSyncRunRepository, syncRunRepo),
    )

    await Effect.runPromise(
      recordBackfillFailureUseCase({
        organizationId: ORG,
        destinationId: DEST,
        source: "spans",
        windowStart: new Date("2026-05-01T00:00:00.000Z"),
        windowEnd: new Date("2026-05-15T00:00:00.000Z"),
        message: "[401] invalid_api_key",
        now: NOW,
      }).pipe(Effect.provide(layer)),
    )

    expect(syncRunRows).toHaveLength(1)
    expect(syncRunRows[0]?.status).toBe("failed")
    expect(syncRunRows[0]?.trigger).toBe("backfill")
    expect(syncRunRows[0]?.error).toBe("[401] invalid_api_key")
    expect(stateRows[0]?.backfillStartedAt).toBeNull()
  })
})
