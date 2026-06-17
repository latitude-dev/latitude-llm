import { DestinationId, OrganizationId, ProjectId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { POSTHOG_US_INGESTION_HOST } from "../constants.ts"
import { createDestination, type Destination } from "../entities/destination.ts"
import { DestinationRepository } from "../ports/destination-repository.ts"
import { createFakeDestinationRepository } from "../testing/fake-destination-repository.ts"
import { pauseDestinationUseCase } from "./pause-destination.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")
const orgId = OrganizationId(cuid("o"))
const projectId = ProjectId(cuid("p"))
const destinationId = DestinationId(cuid("d"))
const userId = UserId(cuid("u"))

const baseDestination = (overrides: Partial<Destination> = {}): Destination => ({
  ...createDestination({
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
  }),
  ...overrides,
})

function setup(seed: Destination) {
  const { repo, rows } = createFakeDestinationRepository([seed])
  const layer = Layer.mergeAll(
    Layer.succeed(DestinationRepository, repo),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
  )
  return { rows, layer }
}

describe("pauseDestinationUseCase", () => {
  it("pauses an active destination", async () => {
    const { rows, layer } = setup(baseDestination())

    const updated = await Effect.runPromise(
      pauseDestinationUseCase({ organizationId: orgId, projectId, destinationId }).pipe(Effect.provide(layer)),
    )

    expect(updated.status).toBe("paused")
    expect(rows[0]?.status).toBe("paused")
  })

  it("is idempotent when already paused", async () => {
    const { layer } = setup(baseDestination({ status: "paused" }))

    const updated = await Effect.runPromise(
      pauseDestinationUseCase({ organizationId: orgId, projectId, destinationId }).pipe(Effect.provide(layer)),
    )

    expect(updated.status).toBe("paused")
  })

  it("fails with NotFoundError for an unknown destination", async () => {
    const { layer } = setup(baseDestination())

    const error = await Effect.runPromise(
      pauseDestinationUseCase({ organizationId: orgId, projectId, destinationId: DestinationId(cuid("missing")) }).pipe(
        Effect.provide(layer),
        Effect.flip,
      ),
    )

    expect(error._tag).toBe("NotFoundError")
  })

  it("fails with NotFoundError when the destination belongs to another project", async () => {
    const { layer } = setup(baseDestination())

    const error = await Effect.runPromise(
      pauseDestinationUseCase({ organizationId: orgId, projectId: ProjectId(cuid("other")), destinationId }).pipe(
        Effect.provide(layer),
        Effect.flip,
      ),
    )

    expect(error._tag).toBe("NotFoundError")
  })
})
