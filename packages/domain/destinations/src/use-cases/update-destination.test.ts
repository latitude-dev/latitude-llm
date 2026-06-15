import { DestinationId, OrganizationId, ProjectId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { POSTHOG_EU_INGESTION_HOST, POSTHOG_US_INGESTION_HOST } from "../constants.ts"
import { createDestination, type Destination } from "../entities/destination.ts"
import { DestinationRepository } from "../ports/destination-repository.ts"
import { createFakeDestinationRepository } from "../testing/fake-destination-repository.ts"
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
      excludePayloads: false,
      intervalMs: 300_000,
      maxSpansPerRun: 50_000,
    },
    credentials: { kind: "posthog", apiKey: "phc_old" },
    createdByUserId: userId,
  })

function setup(seed: Destination) {
  const { repo, rows } = createFakeDestinationRepository([seed])
  const layer = Layer.mergeAll(
    Layer.succeed(DestinationRepository, repo),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
  )
  return { rows, layer }
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
          excludePayloads: false,
          intervalMs: 300_000,
          maxSpansPerRun: 50_000,
        },
      }).pipe(Effect.provide(layer)),
    )

    expect(updated.status).toBe("active")
    expect(updated.consecutiveFailures).toBe(0)
    expect(updated.config.host).toBe(POSTHOG_EU_INGESTION_HOST)
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
          excludePayloads: true,
          intervalMs: 60_000,
          maxSpansPerRun: 10_000,
        },
      }).pipe(Effect.provide(layer)),
    )

    expect(updated.status).toBe("quarantined")
    expect(updated.consecutiveFailures).toBe(5)
    expect(updated.config.excludePayloads).toBe(true)
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
