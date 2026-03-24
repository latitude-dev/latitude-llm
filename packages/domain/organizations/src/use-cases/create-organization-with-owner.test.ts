import { SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { MembershipRepository } from "../ports/membership-repository.ts"
import { OrganizationRepository } from "../ports/organization-repository.ts"
import { createFakeMembershipRepository } from "../testing/fake-membership-repository.ts"
import { createFakeOrganizationRepository } from "../testing/fake-organization-repository.ts"
import { createOrganizationWithOwnerUseCase } from "./create-organization-with-owner.ts"

const USER_ID = UserId("user_1")

const createTestLayers = () => {
  const { repository: orgRepo, organizations } = createFakeOrganizationRepository()
  const { repository: membershipRepo, memberships } = createFakeMembershipRepository()
  const fakeSqlClient = createFakeSqlClient()

  const testLayers = Layer.mergeAll(
    Layer.succeed(OrganizationRepository, orgRepo),
    Layer.succeed(MembershipRepository, membershipRepo),
    Layer.succeed(SqlClient, fakeSqlClient),
  )

  return { organizations, memberships, testLayers }
}

describe("createOrganizationWithOwnerUseCase", () => {
  it("creates an organization and an owner membership", async () => {
    const { organizations, memberships, testLayers } = createTestLayers()

    const result = await Effect.runPromise(
      createOrganizationWithOwnerUseCase({
        name: "My Organization",
        creatorId: USER_ID,
      }).pipe(Effect.provide(testLayers)),
    )

    expect(result.name).toBe("My Organization")
    expect(result.creatorId).toBe(USER_ID)
    expect(organizations.size).toBe(1)

    const membershipList = [...memberships.values()]
    expect(membershipList).toHaveLength(1)
    expect(membershipList[0]?.userId).toBe(USER_ID)
    expect(membershipList[0]?.role).toBe("owner")
    expect(membershipList[0]?.organizationId).toBe(result.id)
  })

  it("creates unique slugs for different organizations", async () => {
    const { organizations, testLayers } = createTestLayers()

    const org1 = await Effect.runPromise(
      createOrganizationWithOwnerUseCase({
        name: "My Organization",
        creatorId: USER_ID,
      }).pipe(Effect.provide(testLayers)),
    )

    const org2 = await Effect.runPromise(
      createOrganizationWithOwnerUseCase({
        name: "My Organization",
        creatorId: USER_ID,
      }).pipe(Effect.provide(testLayers)),
    )

    expect(organizations.size).toBe(2)
    expect(org1.slug).not.toBe(org2.slug)
  })
})
