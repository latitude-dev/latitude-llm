import { type DestinationId, OrganizationId, ProjectId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { POSTHOG_US_INGESTION_HOST } from "../constants.ts"
import { createDestination, type Destination } from "../entities/destination.ts"
import { defaultSourceConfig } from "../entities/destination-source.ts"
import { createDestinationSourceState } from "../entities/destination-source-state.ts"
import { createDestinationSyncRun, type DestinationSyncRun } from "../entities/destination-sync-run.ts"
import { DestinationRepository } from "../ports/destination-repository.ts"
import { DestinationSourceStateRepository } from "../ports/destination-source-state-repository.ts"
import { DestinationSyncRunRepository } from "../ports/destination-sync-run-repository.ts"
import { createFakeDestinationRepository } from "../testing/fake-destination-repository.ts"
import { createFakeDestinationSourceStateRepository } from "../testing/fake-destination-source-state-repository.ts"
import { createFakeDestinationSyncRunRepository } from "../testing/fake-destination-sync-run-repository.ts"
import { deleteProjectDestinationsUseCase } from "./delete-project-destinations.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

const orgId = OrganizationId(cuid("o"))
const userId = UserId(cuid("u"))
const targetProjectId = ProjectId(cuid("target"))
const otherProjectId = ProjectId(cuid("other"))

const destination = (id: string, projectId: ProjectId) =>
  createDestination({
    id: id as DestinationId,
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

const syncRun = (destinationId: string): DestinationSyncRun =>
  createDestinationSyncRun({
    organizationId: orgId,
    destinationId: destinationId as DestinationId,
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

const cursor = (destination: Destination) =>
  createDestinationSourceState({
    organizationId: orgId,
    destinationId: destination.id,
    source: "spans",
    config: defaultSourceConfig("spans"),
    watermark: new Date("2026-06-01T00:00:00Z"),
  })

function setup() {
  const target = destination(cuid("dtarget"), targetProjectId)
  const other = destination(cuid("dother"), otherProjectId)

  const { repo: destinationRepo, rows: destinationRows } = createFakeDestinationRepository([target, other])
  const { repo: syncRunRepo, rows: syncRunRows } = createFakeDestinationSyncRunRepository([
    syncRun(target.id),
    syncRun(other.id),
  ])
  const { repo: cursorRepo, rows: cursorRows } = createFakeDestinationSourceStateRepository(
    [cursor(target), cursor(other)],
    destinationRows,
  )

  const layer = Layer.mergeAll(
    Layer.succeed(DestinationRepository, destinationRepo),
    Layer.succeed(DestinationSyncRunRepository, syncRunRepo),
    Layer.succeed(DestinationSourceStateRepository, cursorRepo),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
  )

  return { target, other, destinationRows, syncRunRows, cursorRows, layer }
}

describe("deleteProjectDestinationsUseCase", () => {
  it("removes the project's destinations and their sync runs and cursors, leaving other projects untouched", async () => {
    const { other, destinationRows, syncRunRows, cursorRows, layer } = setup()

    const result = await Effect.runPromise(
      deleteProjectDestinationsUseCase({ organizationId: orgId, projectId: targetProjectId }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(result.deleted).toBe(1)
    expect(destinationRows.map((r) => r.id)).toEqual([other.id])
    expect(syncRunRows.map((r) => r.destinationId)).toEqual([other.id])
    expect(cursorRows.map((r) => r.destinationId)).toEqual([other.id])
  })

  it("stops the deleted project's destination from being selected by the sweep", async () => {
    const { layer } = setup()

    const due = await Effect.runPromise(
      Effect.gen(function* () {
        yield* deleteProjectDestinationsUseCase({ organizationId: orgId, projectId: targetProjectId })
        const cursors = yield* DestinationSourceStateRepository
        return yield* cursors.listDue(new Date())
      }).pipe(Effect.provide(layer)),
    )

    expect(due.map((d) => d.destination.projectId)).toEqual([otherProjectId])
  })

  it("is a no-op when the project has no destinations", async () => {
    const { destinationRows, syncRunRows, layer } = setup()

    const result = await Effect.runPromise(
      deleteProjectDestinationsUseCase({ organizationId: orgId, projectId: ProjectId(cuid("empty")) }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(result.deleted).toBe(0)
    expect(destinationRows).toHaveLength(2)
    expect(syncRunRows).toHaveLength(2)
  })
})
