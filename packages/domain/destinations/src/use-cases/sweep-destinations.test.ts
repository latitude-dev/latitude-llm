import { QueuePublishError } from "@domain/queue"
import { type DestinationId, OrganizationId, ProjectId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer, Ref } from "effect"
import { describe, expect, it } from "vitest"
import { POSTHOG_US_INGESTION_HOST } from "../constants.ts"
import { createDestination, type Destination } from "../entities/destination.ts"
import { createDestinationSourceCursor, type DestinationSourceCursor } from "../entities/destination-source-cursor.ts"
import { DestinationSourceCursorRepository } from "../ports/destination-source-cursor-repository.ts"
import { createFakeDestinationSourceCursorRepository } from "../testing/fake-destination-source-cursor-repository.ts"
import { sweepDestinationsUseCase } from "./sweep-destinations.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")
const USER_ID = UserId(cuid("u"))
const NOW = new Date("2026-06-01T12:00:00.000Z")

const makeDestination = (seed: string, organizationId: string, overrides: Partial<Destination> = {}): Destination => ({
  ...createDestination({
    id: cuid(`d${seed}`) as DestinationId,
    organizationId: OrganizationId(organizationId),
    projectId: ProjectId(cuid(`p${seed}`)),
    name: `dest ${seed}`,
    config: {
      kind: "posthog",
      host: POSTHOG_US_INGESTION_HOST,
      excludePayloads: false,
      intervalMs: 300_000,
      maxSpansPerRun: 50_000,
    },
    credentials: { kind: "posthog", apiKey: "phc_test" },
    createdByUserId: USER_ID,
  }),
  ...overrides,
})

// never-ran cursors are always due
const makeCursor = (destination: Destination): DestinationSourceCursor =>
  createDestinationSourceCursor({
    organizationId: destination.organizationId,
    destinationId: destination.id,
    source: "spans",
    watermark: destination.createdAt,
  })

const run = (opts: { destinations: readonly Destination[] }) =>
  Effect.gen(function* () {
    const { repo: cursorRepo } = createFakeDestinationSourceCursorRepository(
      opts.destinations.map(makeCursor),
      opts.destinations,
    )
    const publishedRef = yield* Ref.make<{ organizationId: string; destinationId: string; source: string }[]>([])

    const layer = Layer.mergeAll(
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId("system") })),
      Layer.succeed(DestinationSourceCursorRepository, cursorRepo),
    )

    const result = yield* sweepDestinationsUseCase({
      now: NOW,
      publish: ({ organizationId, destination, source }) =>
        Ref.update(publishedRef, (acc) => [...acc, { organizationId, destinationId: destination.id, source }]).pipe(
          Effect.asVoid,
        ),
    }).pipe(Effect.provide(layer))

    return {
      result,
      published: yield* Ref.get(publishedRef),
    }
  })

describe("sweepDestinationsUseCase", () => {
  it("fans out runSync for every due destination across orgs (sandbox/paused already excluded by listDue)", async () => {
    const orgA = cuid("oa")
    const orgB = cuid("ob")
    const { result, published } = await Effect.runPromise(
      run({
        destinations: [
          makeDestination("1", orgA),
          makeDestination("2", orgA),
          makeDestination("3", orgB),
          makeDestination("4", orgA, { status: "paused" }), // not due — listDue filters it
        ],
      }),
    )

    expect(result.due).toBe(3)
    expect(result.published).toBe(3)
    expect(result.failed).toBe(0)
    expect(published.map((p) => p.destinationId).sort()).toEqual([cuid("d1"), cuid("d2"), cuid("d3")].sort())
    expect(published.map((p) => p.source)).toEqual(["spans", "spans", "spans"])
  })

  it("tallies per-destination publish failures without failing the sweep", async () => {
    const orgA = cuid("oa")
    const { result } = await Effect.runPromise(
      Effect.gen(function* () {
        const destination = makeDestination("1", orgA)
        const { repo: cursorRepo } = createFakeDestinationSourceCursorRepository(
          [makeCursor(destination)],
          [destination],
        )
        const layer = Layer.mergeAll(
          Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId("system") })),
          Layer.succeed(DestinationSourceCursorRepository, cursorRepo),
        )
        const result = yield* sweepDestinationsUseCase({
          now: NOW,
          publish: () => Effect.fail(new QueuePublishError({ cause: "boom", queue: "destinations" })),
        }).pipe(Effect.provide(layer))
        return { result }
      }),
    )

    expect(result.due).toBe(1)
    expect(result.published).toBe(0)
    expect(result.failed).toBe(1)
  })
})
