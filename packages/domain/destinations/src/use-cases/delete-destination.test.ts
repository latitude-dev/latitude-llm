import { DestinationId, OrganizationId, ProjectId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { POSTHOG_US_INGESTION_HOST } from "../constants.ts"
import { createDestination } from "../entities/destination.ts"
import { defaultSourceConfig } from "../entities/destination-source.ts"
import { createDestinationSourceState } from "../entities/destination-source-state.ts"
import { createDestinationSyncRun } from "../entities/destination-sync-run.ts"
import { DestinationRepository } from "../ports/destination-repository.ts"
import { DestinationSourceStateRepository } from "../ports/destination-source-state-repository.ts"
import { DestinationSyncRunRepository } from "../ports/destination-sync-run-repository.ts"
import { createFakeDestinationRepository } from "../testing/fake-destination-repository.ts"
import { createFakeDestinationSourceStateRepository } from "../testing/fake-destination-source-state-repository.ts"
import { createFakeDestinationSyncRunRepository } from "../testing/fake-destination-sync-run-repository.ts"
import { deleteDestinationUseCase } from "./delete-destination.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")
const orgId = OrganizationId(cuid("o"))
const projectId = ProjectId(cuid("p"))
const destinationId = DestinationId(cuid("d"))
const userId = UserId(cuid("u"))

const destination = () =>
  createDestination({
    id: destinationId,
    organizationId: orgId,
    projectId,
    name: "Acme PostHog",
    config: {
      kind: "posthog",
      host: POSTHOG_US_INGESTION_HOST,
      intervalMs: 300_000,
    },
    credentials: { kind: "posthog", apiKey: "phc_test" },
    createdByUserId: userId,
  })

const syncRun = () =>
  createDestinationSyncRun({
    organizationId: orgId,
    destinationId,
    source: "spans",
    windowStart: new Date("2026-06-01T00:00:00Z"),
    windowEnd: new Date("2026-06-01T00:05:00Z"),
    status: "succeeded",
    spansRead: 10,
    eventsSent: 12,
    eventsDropped: 0,
    error: null,
    startedAt: new Date("2026-06-01T00:05:00Z"),
    finishedAt: new Date("2026-06-01T00:05:01Z"),
  })

const cursor = () =>
  createDestinationSourceState({
    organizationId: orgId,
    destinationId,
    source: "spans",
    config: defaultSourceConfig("spans"),
    watermark: new Date("2026-06-01T00:00:00Z"),
  })

function setup() {
  const { repo: destinationRepo, rows: destinationRows } = createFakeDestinationRepository([destination()])
  const { repo: syncRunRepo, rows: syncRunRows } = createFakeDestinationSyncRunRepository([syncRun()])
  const { repo: cursorRepo, rows: cursorRows } = createFakeDestinationSourceStateRepository([cursor()], destinationRows)
  const layer = Layer.mergeAll(
    Layer.succeed(DestinationRepository, destinationRepo),
    Layer.succeed(DestinationSyncRunRepository, syncRunRepo),
    Layer.succeed(DestinationSourceStateRepository, cursorRepo),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
  )
  return { destinationRows, syncRunRows, cursorRows, layer }
}

describe("deleteDestinationUseCase", () => {
  it("hard-deletes the destination and its sync-run and cursor history", async () => {
    const { destinationRows, syncRunRows, cursorRows, layer } = setup()

    await Effect.runPromise(
      deleteDestinationUseCase({ organizationId: orgId, projectId, destinationId }).pipe(Effect.provide(layer)),
    )

    expect(destinationRows).toHaveLength(0)
    expect(syncRunRows).toHaveLength(0)
    expect(cursorRows).toHaveLength(0)
  })

  it("fails with NotFoundError for an unknown destination and leaves rows intact", async () => {
    const { destinationRows, syncRunRows, cursorRows, layer } = setup()

    const error = await Effect.runPromise(
      deleteDestinationUseCase({
        organizationId: orgId,
        projectId,
        destinationId: DestinationId(cuid("missing")),
      }).pipe(Effect.provide(layer), Effect.flip),
    )

    expect(error._tag).toBe("NotFoundError")
    expect(destinationRows).toHaveLength(1)
    expect(syncRunRows).toHaveLength(1)
    expect(cursorRows).toHaveLength(1)
  })

  it("fails with NotFoundError when the destination belongs to another project", async () => {
    const { destinationRows, layer } = setup()

    const error = await Effect.runPromise(
      deleteDestinationUseCase({ organizationId: orgId, projectId: ProjectId(cuid("other")), destinationId }).pipe(
        Effect.provide(layer),
        Effect.flip,
      ),
    )

    expect(error._tag).toBe("NotFoundError")
    expect(destinationRows).toHaveLength(1)
  })
})
