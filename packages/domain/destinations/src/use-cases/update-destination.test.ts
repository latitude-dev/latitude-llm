import { DestinationId, OrganizationId, ProjectId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { POSTHOG_EU_INGESTION_HOST, POSTHOG_US_INGESTION_HOST } from "../constants.ts"
import { createDestination, type Destination } from "../entities/destination.ts"
import { createDestinationSourceState } from "../entities/destination-source-state.ts"
import { DestinationRepository } from "../ports/destination-repository.ts"
import { DestinationSourceStateRepository } from "../ports/destination-source-state-repository.ts"
import { createFakeDestinationRepository } from "../testing/fake-destination-repository.ts"
import { createFakeDestinationSourceStateRepository } from "../testing/fake-destination-source-state-repository.ts"
import { updateDestinationUseCase } from "./update-destination.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")
const orgId = OrganizationId(cuid("o"))
const projectId = ProjectId(cuid("p"))
const destinationId = DestinationId(cuid("d"))
const userId = UserId(cuid("u"))

const baseDestination = () =>
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
    credentials: { kind: "posthog", apiKey: "phc_old" },
    createdByUserId: userId,
  })

function setup(seed: Destination) {
  const { repo, rows } = createFakeDestinationRepository([seed])
  const { repo: sourceRepo, rows: sourceRows } = createFakeDestinationSourceStateRepository([], rows)
  const layer = Layer.mergeAll(
    Layer.succeed(DestinationRepository, repo),
    Layer.succeed(DestinationSourceStateRepository, sourceRepo),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
  )
  return { rows, sourceRows, layer }
}

const quarantined = (overrides: Partial<Destination> = {}): Destination => ({
  ...baseDestination(),
  status: "quarantined",
  consecutiveFailures: 5,
  lastFailureMessage: "HTTP 401 — invalid key",
  ...overrides,
})

describe("updateDestinationUseCase", () => {
  it("renames without touching the failure counter or status", async () => {
    const { rows, layer } = setup(quarantined())

    const updated = await Effect.runPromise(
      updateDestinationUseCase({ organizationId: orgId, projectId, destinationId, name: "Renamed" }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(updated.name).toBe("Renamed")
    expect(updated.status).toBe("quarantined")
    expect(updated.consecutiveFailures).toBe(5)
    expect(rows[0]?.name).toBe("Renamed")
  })

  it("resets failures and re-activates from quarantine when credentials change", async () => {
    const { rows, layer } = setup(quarantined())

    const updated = await Effect.runPromise(
      updateDestinationUseCase({
        organizationId: orgId,
        projectId,
        destinationId,
        credentials: { kind: "posthog", apiKey: "phc_new" },
      }).pipe(Effect.provide(layer)),
    )

    expect(updated.status).toBe("active")
    expect(updated.consecutiveFailures).toBe(0)
    expect(updated.lastFailureMessage).toBeNull()
    expect(rows[0]?.credentials).toEqual({ kind: "posthog", apiKey: "phc_new" })
  })

  it("resets failures and re-activates from quarantine when the host changes", async () => {
    const { layer } = setup(quarantined())

    const updated = await Effect.runPromise(
      updateDestinationUseCase({
        organizationId: orgId,
        projectId,
        destinationId,
        config: {
          kind: "posthog",
          host: POSTHOG_EU_INGESTION_HOST,
          intervalMs: 300_000,
        },
      }).pipe(Effect.provide(layer)),
    )

    expect(updated.status).toBe("active")
    expect(updated.consecutiveFailures).toBe(0)
    expect(updated.config.host).toBe(POSTHOG_EU_INGESTION_HOST)
  })

  // A source whose coverage was advanced to the floor by a prior backfill (coverage_start_at < created_at).
  const backfilledSource = (createdAt: Date, coverageStartAt: Date) =>
    createDestinationSourceState({
      organizationId: orgId,
      destinationId,
      source: "spans",
      config: { source: "spans", excludePayloads: false, maxRecordsPerRun: 50_000 },
      watermark: coverageStartAt, // createDestinationSourceState seeds coverage_start_at = watermark
      createdAt,
    })

  const setupWithSource = (source: ReturnType<typeof backfilledSource>) => {
    const { repo, rows } = createFakeDestinationRepository([baseDestination()])
    const { repo: sourceRepo, rows: sourceRows } = createFakeDestinationSourceStateRepository([source], rows)
    const layer = Layer.mergeAll(
      Layer.succeed(DestinationRepository, repo),
      Layer.succeed(DestinationSourceStateRepository, sourceRepo),
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
    )
    return { sourceRows, layer }
  }

  it("re-opens backfill coverage when credentials change (coverage_start_at reset to created_at)", async () => {
    const createdAt = new Date("2026-06-10T00:00:00.000Z")
    const floor = new Date("2026-05-19T00:00:00.000Z")
    const { sourceRows, layer } = setupWithSource(backfilledSource(createdAt, floor))
    expect(sourceRows[0]?.coverageStartAt).toEqual(floor) // prior backfill advanced it down to the floor

    await Effect.runPromise(
      updateDestinationUseCase({
        organizationId: orgId,
        projectId,
        destinationId,
        credentials: { kind: "posthog", apiKey: "phc_new" },
      }).pipe(Effect.provide(layer)),
    )

    expect(sourceRows[0]?.coverageStartAt).toEqual(createdAt) // re-opened so the history is re-importable
  })

  it("leaves backfill coverage untouched when only non-credential config changes", async () => {
    const createdAt = new Date("2026-06-10T00:00:00.000Z")
    const floor = new Date("2026-05-19T00:00:00.000Z")
    const { sourceRows, layer } = setupWithSource(backfilledSource(createdAt, floor))

    await Effect.runPromise(
      updateDestinationUseCase({
        organizationId: orgId,
        projectId,
        destinationId,
        config: { kind: "posthog", host: POSTHOG_US_INGESTION_HOST, intervalMs: 60_000 },
      }).pipe(Effect.provide(layer)),
    )

    expect(sourceRows[0]?.coverageStartAt).toEqual(floor) // unchanged — not a reconnect
  })

  it("does not reset failures when only non-credential config changes", async () => {
    const { layer } = setup(quarantined())

    const updated = await Effect.runPromise(
      updateDestinationUseCase({
        organizationId: orgId,
        projectId,
        destinationId,
        config: {
          kind: "posthog",
          host: POSTHOG_US_INGESTION_HOST,
          intervalMs: 60_000,
        },
      }).pipe(Effect.provide(layer)),
    )

    expect(updated.status).toBe("quarantined")
    expect(updated.consecutiveFailures).toBe(5)
    expect(updated.config.intervalMs).toBe(60_000)
  })

  it("preserves config fields omitted from the patch (intervalMs is not reset)", async () => {
    const { rows, layer } = setup({
      ...baseDestination(),
      config: { kind: "posthog", host: POSTHOG_US_INGESTION_HOST, intervalMs: 60_000 },
    })

    const updated = await Effect.runPromise(
      updateDestinationUseCase({
        organizationId: orgId,
        projectId,
        destinationId,
        // Patch carries only the host — intervalMs has no UI and must survive the save.
        config: { kind: "posthog", host: POSTHOG_EU_INGESTION_HOST },
      }).pipe(Effect.provide(layer)),
    )

    expect(updated.config.host).toBe(POSTHOG_EU_INGESTION_HOST)
    expect(updated.config.intervalMs).toBe(60_000)
    expect(rows[0]?.config.intervalMs).toBe(60_000)
  })

  it("merges source-config patches onto the stored source config (maxRecordsPerRun preserved)", async () => {
    const { repo, rows } = createFakeDestinationRepository([baseDestination()])
    const sourceState = createDestinationSourceState({
      organizationId: orgId,
      destinationId,
      source: "spans",
      config: { source: "spans", excludePayloads: false, maxRecordsPerRun: 30_000 },
      watermark: new Date("2026-06-01T00:00:00Z"),
    })
    const { repo: sourceRepo, rows: sourceRows } = createFakeDestinationSourceStateRepository([sourceState], rows)
    const layer = Layer.mergeAll(
      Layer.succeed(DestinationRepository, repo),
      Layer.succeed(DestinationSourceStateRepository, sourceRepo),
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
    )

    await Effect.runPromise(
      updateDestinationUseCase({
        organizationId: orgId,
        projectId,
        destinationId,
        // Patch carries only excludePayloads — maxRecordsPerRun (no UI) must survive.
        sourceConfigs: [{ source: "spans", excludePayloads: true }],
      }).pipe(Effect.provide(layer)),
    )

    const spans = sourceRows.find((s) => s.source === "spans")
    expect(spans?.config).toMatchObject({ source: "spans", excludePayloads: true, maxRecordsPerRun: 30_000 })
  })

  it("re-submitting identical credentials does not reset the counter", async () => {
    const { layer } = setup(quarantined())

    const updated = await Effect.runPromise(
      updateDestinationUseCase({
        organizationId: orgId,
        projectId,
        destinationId,
        credentials: { kind: "posthog", apiKey: "phc_old" },
      }).pipe(Effect.provide(layer)),
    )

    expect(updated.status).toBe("quarantined")
    expect(updated.consecutiveFailures).toBe(5)
  })

  it("treats credentials with the same values but different key order as unchanged", async () => {
    const { layer } = setup(quarantined())

    const updated = await Effect.runPromise(
      updateDestinationUseCase({
        organizationId: orgId,
        projectId,
        destinationId,
        credentials: { apiKey: "phc_old", kind: "posthog" },
      }).pipe(Effect.provide(layer)),
    )

    expect(updated.status).toBe("quarantined")
    expect(updated.consecutiveFailures).toBe(5)
  })

  it("fails with NotFoundError when the destination does not exist", async () => {
    const { layer } = setup(baseDestination())

    const error = await Effect.runPromise(
      updateDestinationUseCase({
        organizationId: orgId,
        projectId,
        destinationId: DestinationId(cuid("missing")),
        name: "Nope",
      }).pipe(Effect.provide(layer), Effect.flip),
    )

    expect(error._tag).toBe("NotFoundError")
  })

  it("fails with NotFoundError when the destination belongs to another project", async () => {
    const { layer } = setup(baseDestination())

    const error = await Effect.runPromise(
      updateDestinationUseCase({
        organizationId: orgId,
        projectId: ProjectId(cuid("other")),
        destinationId,
        name: "Nope",
      }).pipe(Effect.provide(layer), Effect.flip),
    )

    expect(error._tag).toBe("NotFoundError")
  })
})
