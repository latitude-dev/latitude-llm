import { OrganizationId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Exit, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Organization } from "../entities/organization.ts"
import { OrganizationRepository } from "../ports/organization-repository.ts"
import { createFakeOrganizationRepository } from "../testing/fake-organization-repository.ts"
import { updateOrganizationNameUseCase } from "./update-organization-name.ts"

const ORG_ID = OrganizationId("org_1")

const createTestOrganization = (overrides: Partial<Organization> = {}): Organization => ({
  id: ORG_ID,
  name: "Original Name",
  slug: "original-name",
  logo: null,
  metadata: null,
  creatorId: null,
  currentSubscriptionId: null,
  stripeCustomerId: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  ...overrides,
})

const createTestLayers = () => {
  const { repository: orgRepo, organizations } = createFakeOrganizationRepository()
  const fakeSqlClient = createFakeSqlClient()

  const testLayers = Layer.mergeAll(
    Layer.succeed(OrganizationRepository, orgRepo),
    Layer.succeed(SqlClient, fakeSqlClient),
  )

  return { organizations, testLayers }
}

describe("updateOrganizationNameUseCase", () => {
  it("updates the organization name", async () => {
    const { organizations, testLayers } = createTestLayers()
    const org = createTestOrganization()
    organizations.set(ORG_ID, org)

    const result = await Effect.runPromise(
      updateOrganizationNameUseCase({ organizationId: ORG_ID, name: "New Name" }).pipe(Effect.provide(testLayers)),
    )

    expect(result.name).toBe("New Name")
    expect(organizations.get(ORG_ID)!.name).toBe("New Name")
  })

  it("updates the updatedAt timestamp", async () => {
    const { organizations, testLayers } = createTestLayers()
    const org = createTestOrganization()
    organizations.set(ORG_ID, org)

    const before = new Date()
    const result = await Effect.runPromise(
      updateOrganizationNameUseCase({ organizationId: ORG_ID, name: "New Name" }).pipe(Effect.provide(testLayers)),
    )

    expect(result.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
  })

  it("fails when organization does not exist", async () => {
    const { testLayers } = createTestLayers()

    const exit = await Effect.runPromiseExit(
      updateOrganizationNameUseCase({ organizationId: ORG_ID, name: "New Name" }).pipe(Effect.provide(testLayers)),
    )

    expect(Exit.isFailure(exit)).toBe(true)
  })

  it("preserves other organization fields", async () => {
    const { organizations, testLayers } = createTestLayers()
    const org = createTestOrganization({ logo: "logo.png", stripeCustomerId: "cus_123" })
    organizations.set(ORG_ID, org)

    await Effect.runPromise(
      updateOrganizationNameUseCase({ organizationId: ORG_ID, name: "New Name" }).pipe(Effect.provide(testLayers)),
    )

    const updated = organizations.get(ORG_ID)!
    expect(updated.logo).toBe("logo.png")
    expect(updated.stripeCustomerId).toBe("cus_123")
    expect(updated.slug).toBe("original-name")
  })
})
