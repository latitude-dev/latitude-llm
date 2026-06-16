import { DestinationId, OrganizationId, ProjectId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { DESTINATION_QUARANTINE_FAILURE_THRESHOLD, POSTHOG_US_INGESTION_HOST } from "../constants.ts"
import { createDestination, type Destination } from "../entities/destination.ts"
import { createDestinationSourceCursor } from "../entities/destination-source-cursor.ts"
import { DestinationRepository } from "../ports/destination-repository.ts"
import { DestinationSourceCursorRepository } from "../ports/destination-source-cursor-repository.ts"
import { createFakeDestinationRepository } from "../testing/fake-destination-repository.ts"
import { createFakeDestinationSourceCursorRepository } from "../testing/fake-destination-source-cursor-repository.ts"
import { recordDestinationSyncFailureUseCase } from "./record-destination-sync-failure.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")
const ORG_ID = OrganizationId(cuid("o"))
const DESTINATION_ID = DestinationId(cuid("d"))
const NOW = new Date("2026-06-01T12:00:00.000Z")

const makeDestination = (overrides: Partial<Destination> = {}): Destination => ({
  ...createDestination({
    id: DESTINATION_ID,
    organizationId: ORG_ID,
    projectId: ProjectId(cuid("p")),
    name: "Acme PostHog",
    config: {
      kind: "posthog",
      host: POSTHOG_US_INGESTION_HOST,
      excludePayloads: false,
      intervalMs: 300_000,
      maxSpansPerRun: 50_000,
    },
    credentials: { kind: "posthog", apiKey: "phc_test" },
    createdByUserId: UserId(cuid("u")),
  }),
  ...overrides,
})

const SOURCE = "spans" as const

const setup = (seed: Destination | null, cursorOverrides: { consecutiveEmptyRuns?: number } = {}) => {
  const destinations = seed ? [seed] : []
  const { repo, rows } = createFakeDestinationRepository(destinations)
  const cursors = seed
    ? [
        {
          ...createDestinationSourceCursor({
            organizationId: ORG_ID,
            destinationId: DESTINATION_ID,
            source: SOURCE,
            watermark: new Date("2026-05-01T00:00:00.000Z"),
          }),
          consecutiveEmptyRuns: cursorOverrides.consecutiveEmptyRuns ?? 0,
        },
      ]
    : []
  const { repo: cursorRepo, rows: cursorRows } = createFakeDestinationSourceCursorRepository(cursors, rows)
  const layer = Layer.mergeAll(
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
    Layer.succeed(DestinationRepository, repo),
    Layer.succeed(DestinationSourceCursorRepository, cursorRepo),
  )
  return { rows, cursorRows, layer }
}

describe("recordDestinationSyncFailureUseCase", () => {
  it("increments consecutive_failures and keeps the destination active below the threshold", async () => {
    const { rows, cursorRows, layer } = setup(makeDestination({ consecutiveFailures: 1 }), { consecutiveEmptyRuns: 4 })

    const result = await Effect.runPromise(
      recordDestinationSyncFailureUseCase({
        destinationId: DESTINATION_ID,
        source: SOURCE,
        now: NOW,
        message: "[502] upstream",
      }).pipe(Effect.provide(layer)),
    )

    expect(result.outcome).toBe("recorded")
    expect(result.consecutiveFailures).toBe(2)
    expect(rows[0]?.status).toBe("active")
    expect(rows[0]?.consecutiveFailures).toBe(2)
    expect(rows[0]?.lastFailureMessage).toBe("[502] upstream")
    expect(cursorRows[0]?.consecutiveEmptyRuns).toBe(4) // untouched
    expect(cursorRows[0]?.lastRunAt).toEqual(NOW)
  })

  it("quarantines once the failure threshold is reached", async () => {
    const { rows, layer } = setup(
      makeDestination({ consecutiveFailures: DESTINATION_QUARANTINE_FAILURE_THRESHOLD - 1 }),
    )

    const result = await Effect.runPromise(
      recordDestinationSyncFailureUseCase({
        destinationId: DESTINATION_ID,
        source: SOURCE,
        now: NOW,
        message: "transport",
      }).pipe(Effect.provide(layer)),
    )

    expect(result.outcome).toBe("quarantined")
    expect(result.consecutiveFailures).toBe(DESTINATION_QUARANTINE_FAILURE_THRESHOLD)
    expect(rows[0]?.status).toBe("quarantined")
  })

  it("leaves a non-active destination untouched", async () => {
    const { rows, layer } = setup(makeDestination({ status: "paused", consecutiveFailures: 2 }))

    const result = await Effect.runPromise(
      recordDestinationSyncFailureUseCase({
        destinationId: DESTINATION_ID,
        source: SOURCE,
        now: NOW,
        message: "transport",
      }).pipe(Effect.provide(layer)),
    )

    expect(result.outcome).toBe("skipped")
    expect(rows[0]?.status).toBe("paused")
    expect(rows[0]?.consecutiveFailures).toBe(2)
  })

  it("skips cleanly when the destination was deleted mid-retry", async () => {
    const { layer } = setup(null)

    const result = await Effect.runPromise(
      recordDestinationSyncFailureUseCase({
        destinationId: DESTINATION_ID,
        source: SOURCE,
        now: NOW,
        message: "transport",
      }).pipe(Effect.provide(layer)),
    )

    expect(result.outcome).toBe("skipped")
    expect(result.consecutiveFailures).toBe(0)
  })
})
