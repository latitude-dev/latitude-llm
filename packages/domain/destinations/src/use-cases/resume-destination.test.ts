import { QueuePublishError } from "@domain/queue"
import { DestinationId, OrganizationId, ProjectId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { POSTHOG_US_INGESTION_HOST } from "../constants.ts"
import { createDestination, type Destination } from "../entities/destination.ts"
import type { DestinationSource } from "../entities/destination-source.ts"
import { defaultSourceConfig } from "../entities/destination-source.ts"
import { createDestinationSourceState, type DestinationSourceState } from "../entities/destination-source-state.ts"
import { DestinationDeliverers } from "../ports/destination-deliverer.ts"
import { DestinationRepository } from "../ports/destination-repository.ts"
import { DestinationRetentionPolicy } from "../ports/destination-retention-policy.ts"
import { DestinationSourceStateRepository } from "../ports/destination-source-state-repository.ts"
import { createFakeDestinationDeliverer } from "../testing/fake-destination-deliverer.ts"
import { createFakeDestinationRepository } from "../testing/fake-destination-repository.ts"
import { createFakeRetentionPolicy } from "../testing/fake-destination-retention-policy.ts"
import { createFakeDestinationSourceStateRepository } from "../testing/fake-destination-source-state-repository.ts"
import { resumeDestinationUseCase } from "./resume-destination.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")
const orgId = OrganizationId(cuid("o"))
const projectId = ProjectId(cuid("p"))
const destinationId = DestinationId(cuid("d"))
const userId = UserId(cuid("u"))
const SOURCE = "spans" as const

const NOW = new Date("2026-06-01T12:00:00.000Z")
const BOUNDARY_MS = 48 * 60 * 60 * 1000
// Generous retention window so offered gaps aren't clamped in these tests.
const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000

const baseDestination = (overrides: Partial<Destination> = {}): Destination => ({
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

const sourceState = (watermark: Date): DestinationSourceState => ({
  ...createDestinationSourceState({
    organizationId: orgId,
    destinationId,
    source: SOURCE,
    config: defaultSourceConfig(SOURCE),
    watermark,
  }),
})

function setup(seed: Destination, state: DestinationSourceState, historicalBoundaryMs?: number) {
  const { repo, rows } = createFakeDestinationRepository([seed])
  const { repo: stateRepo, rows: stateRows } = createFakeDestinationSourceStateRepository([state], rows)
  const { deliverer } = createFakeDestinationDeliverer(
    historicalBoundaryMs === undefined ? {} : { historicalBoundaryMs },
  )
  const layer = Layer.mergeAll(
    Layer.succeed(DestinationRepository, repo),
    Layer.succeed(DestinationSourceStateRepository, stateRepo),
    Layer.succeed(DestinationDeliverers, { posthog: deliverer }),
    Layer.succeed(DestinationRetentionPolicy, createFakeRetentionPolicy(MAX_AGE_MS)),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
  )
  return { rows, stateRows, layer }
}

const recordingPublish = () => {
  const calls: { source: DestinationSource; since: Date; until: Date }[] = []
  return {
    calls,
    publish: (job: { source: DestinationSource; since: Date; until: Date }) => Effect.sync(() => void calls.push(job)),
  }
}

const failingPublish = (job: { source: DestinationSource; since: Date; until: Date }) =>
  Effect.fail(new QueuePublishError({ cause: `no queue for ${job.source}`, queue: "destinations" }))

describe("resumeDestinationUseCase", () => {
  it("resumes a paused destination to active", async () => {
    const { rows, layer } = setup(
      baseDestination({ status: "paused" }),
      sourceState(new Date("2026-05-31T12:00:00.000Z")), // within boundary
      BOUNDARY_MS,
    )

    const result = await Effect.runPromise(
      resumeDestinationUseCase({
        organizationId: orgId,
        projectId,
        destinationId,
        now: NOW,
        publish: recordingPublish().publish,
      }).pipe(Effect.provide(layer)),
    )

    expect(result.destination.status).toBe("active")
    expect(rows[0]?.status).toBe("active")
  })

  it("enqueues a gap backfill and jumps the cursor when the gap reaches past the historical boundary", async () => {
    const oldWatermark = new Date("2026-05-20T00:00:00.000Z") // ~12 days back, well past 48h
    const { stateRows, layer } = setup(baseDestination({ status: "paused" }), sourceState(oldWatermark), BOUNDARY_MS)
    const { calls, publish } = recordingPublish()

    const result = await Effect.runPromise(
      resumeDestinationUseCase({
        organizationId: orgId,
        projectId,
        destinationId,
        now: NOW,
        publish,
      }).pipe(Effect.provide(layer)),
    )

    expect(result.backfillsStarted).toBe(1)
    expect(result.backfillsFailed).toBe(0)
    expect(calls).toEqual([{ source: SOURCE, since: oldWatermark, until: NOW }])
    // Live cursor jumped to now so live resumes forward; the gap goes through backfill.
    expect(stateRows[0]?.watermark).toEqual(NOW)
    expect(stateRows[0]?.watermarkId).toBe("")
  })

  it("leaves the cursor when the gap backfill fails to enqueue (live catch-up covers it)", async () => {
    const oldWatermark = new Date("2026-05-20T00:00:00.000Z")
    const { stateRows, layer } = setup(baseDestination({ status: "paused" }), sourceState(oldWatermark), BOUNDARY_MS)

    const result = await Effect.runPromise(
      resumeDestinationUseCase({
        organizationId: orgId,
        projectId,
        destinationId,
        now: NOW,
        publish: failingPublish,
      }).pipe(Effect.provide(layer)),
    )

    expect(result.destination.status).toBe("active")
    expect(result.backfillsStarted).toBe(0)
    expect(result.backfillsFailed).toBe(1)
    expect(stateRows[0]?.watermark).toEqual(oldWatermark) // not jumped → live catch-up still covers the gap
  })

  it("does not enqueue or jump when the gap is within the boundary", async () => {
    const recent = new Date("2026-05-31T18:00:00.000Z") // < 48h before now
    const { stateRows, layer } = setup(baseDestination({ status: "paused" }), sourceState(recent), BOUNDARY_MS)
    const { calls, publish } = recordingPublish()

    const result = await Effect.runPromise(
      resumeDestinationUseCase({
        organizationId: orgId,
        projectId,
        destinationId,
        now: NOW,
        publish,
      }).pipe(Effect.provide(layer)),
    )

    expect(result.backfillsStarted).toBe(0)
    expect(calls).toEqual([])
    expect(stateRows[0]?.watermark).toEqual(recent) // untouched → forward catch-up
  })

  it("never enqueues or jumps for a boundary-less destination", async () => {
    const old = new Date("2026-01-01T00:00:00.000Z")
    const { stateRows, layer } = setup(baseDestination({ status: "paused" }), sourceState(old)) // no boundary
    const { calls, publish } = recordingPublish()

    const result = await Effect.runPromise(
      resumeDestinationUseCase({
        organizationId: orgId,
        projectId,
        destinationId,
        now: NOW,
        publish,
      }).pipe(Effect.provide(layer)),
    )

    expect(result.backfillsStarted).toBe(0)
    expect(calls).toEqual([])
    expect(stateRows[0]?.watermark).toEqual(old)
  })

  it("is idempotent when already active", async () => {
    const { layer } = setup(baseDestination(), sourceState(NOW), BOUNDARY_MS)

    const result = await Effect.runPromise(
      resumeDestinationUseCase({
        organizationId: orgId,
        projectId,
        destinationId,
        now: NOW,
        publish: recordingPublish().publish,
      }).pipe(Effect.provide(layer)),
    )

    expect(result.destination.status).toBe("active")
    expect(result.backfillsStarted).toBe(0)
  })

  it("fails with NotFoundError for an unknown destination", async () => {
    const { layer } = setup(baseDestination({ status: "paused" }), sourceState(NOW), BOUNDARY_MS)

    const error = await Effect.runPromise(
      resumeDestinationUseCase({
        organizationId: orgId,
        projectId,
        destinationId: DestinationId(cuid("missing")),
        now: NOW,
        publish: recordingPublish().publish,
      }).pipe(Effect.provide(layer), Effect.flip),
    )

    expect(error._tag).toBe("NotFoundError")
  })
})
