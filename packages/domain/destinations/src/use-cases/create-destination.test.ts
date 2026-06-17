import { createOrganization, OrganizationRepository } from "@domain/organizations"
import { createFakeOrganizationRepository } from "@domain/organizations/testing"
import { OrganizationId, ProjectId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { POSTHOG_US_INGESTION_HOST } from "../constants.ts"
import { DestinationRepository } from "../ports/destination-repository.ts"
import { DestinationSourceStateRepository } from "../ports/destination-source-state-repository.ts"
import { createFakeDestinationRepository } from "../testing/fake-destination-repository.ts"
import { createFakeDestinationSourceStateRepository } from "../testing/fake-destination-source-state-repository.ts"
import { createDestinationUseCase } from "./create-destination.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

function setup(opts: { sandbox?: boolean } = {}) {
  const orgId = OrganizationId(cuid("o"))
  const projectId = ProjectId(cuid("p"))
  const userId = UserId(cuid("u"))

  const { repository: organizationRepo, organizations } = createFakeOrganizationRepository()
  organizations.set(
    orgId,
    createOrganization({
      id: orgId,
      name: "Acme",
      slug: "acme",
      parentOrgId: opts.sandbox ? OrganizationId(cuid("parent")) : null,
    }),
  )

  const { repo: destinationRepo, rows } = createFakeDestinationRepository()
  const { repo: cursorRepo, rows: cursorRows } = createFakeDestinationSourceStateRepository([], rows)

  const layer = Layer.mergeAll(
    Layer.succeed(OrganizationRepository, organizationRepo),
    Layer.succeed(DestinationRepository, destinationRepo),
    Layer.succeed(DestinationSourceStateRepository, cursorRepo),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
  )

  return { orgId, projectId, userId, rows, cursorRows, layer }
}

const input = (ids: { orgId: OrganizationId; projectId: ProjectId; userId: UserId }) => ({
  organizationId: ids.orgId,
  projectId: ids.projectId,
  name: "Acme PostHog",
  config: {
    kind: "posthog" as const,
    host: POSTHOG_US_INGESTION_HOST,
    intervalMs: 300_000,
  },
  credentials: { kind: "posthog" as const, apiKey: "phc_test" },
  createdByUserId: ids.userId,
})

describe("createDestinationUseCase", () => {
  it("creates an active destination for a regular organization", async () => {
    const { rows, cursorRows, layer, ...ids } = setup()

    const destination = await Effect.runPromise(createDestinationUseCase(input(ids)).pipe(Effect.provide(layer)))

    expect(destination.status).toBe("active")
    expect(destination.projectId).toBe(ids.projectId)
    expect(rows).toHaveLength(1)

    expect(cursorRows).toHaveLength(1)
    const cursor = cursorRows[0]
    expect(cursor?.destinationId).toBe(destination.id)
    expect(cursor?.source).toBe("spans")
    expect(cursor?.watermark).toEqual(destination.createdAt)
  })

  it("rejects sandbox organizations", async () => {
    const { rows, layer, ...ids } = setup({ sandbox: true })

    const error = await Effect.runPromise(createDestinationUseCase(input(ids)).pipe(Effect.provide(layer), Effect.flip))

    expect(error._tag).toBe("SandboxOrganizationDestinationError")
    expect(rows).toHaveLength(0)
  })

  it("fails with ConflictError when the project already has a destination of that kind", async () => {
    const { rows, layer, ...ids } = setup()

    await Effect.runPromise(createDestinationUseCase(input(ids)).pipe(Effect.provide(layer)))
    const error = await Effect.runPromise(createDestinationUseCase(input(ids)).pipe(Effect.provide(layer), Effect.flip))

    expect(error._tag).toBe("ConflictError")
    expect(rows).toHaveLength(1)
  })
})
