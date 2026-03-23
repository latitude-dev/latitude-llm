import { OrganizationId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { createMembership } from "../entities/membership.ts"
import { createOrganization } from "../entities/organization.ts"
import { MembershipRepository } from "../ports/membership-repository.ts"
import { OrganizationRepository } from "../ports/organization-repository.ts"
import { createFakeMembershipRepository } from "../testing/fake-membership-repository.ts"
import { createFakeOrganizationRepository } from "../testing/fake-organization-repository.ts"
import { cleanupUserMembershipsUseCase } from "./cleanup-user-memberships.ts"

const USER_ID = "user_1"
const OTHER_USER_ID = "user_2"
const ORG_1 = OrganizationId("org_1")
const ORG_2 = OrganizationId("org_2")

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

const seedOrganization = (
  organizations: Map<OrganizationId, ReturnType<typeof createOrganization>>,
  id: OrganizationId,
  creatorId: string | null = null,
) => {
  const org = createOrganization({
    id,
    name: `Org ${id}`,
    slug: `org-${id}`,
    creatorId: creatorId ? UserId(creatorId) : undefined,
  })
  organizations.set(id, org)
  return org
}

const seedMembership = (
  memberships: Map<string, ReturnType<typeof createMembership>>,
  orgId: OrganizationId,
  userId: string,
) => {
  const m = createMembership({
    organizationId: orgId,
    userId: UserId(userId),
    role: "owner",
  })
  memberships.set(m.id, m)
  return m
}

describe("cleanupUserMembershipsUseCase", () => {
  it("deletes organization when user is the sole member", async () => {
    const { organizations, memberships, testLayers } = createTestLayers()
    seedOrganization(organizations, ORG_1, USER_ID)
    seedMembership(memberships, ORG_1, USER_ID)

    await Effect.runPromise(cleanupUserMembershipsUseCase({ userId: USER_ID }).pipe(Effect.provide(testLayers)))

    expect(organizations.size).toBe(0)
  })

  it("removes only the membership when other members exist", async () => {
    const { organizations, memberships, testLayers } = createTestLayers()
    seedOrganization(organizations, ORG_1)
    seedMembership(memberships, ORG_1, USER_ID)
    seedMembership(memberships, ORG_1, OTHER_USER_ID)

    await Effect.runPromise(cleanupUserMembershipsUseCase({ userId: USER_ID }).pipe(Effect.provide(testLayers)))

    expect(organizations.size).toBe(1)
    const remainingMembers = [...memberships.values()]
    expect(remainingMembers).toHaveLength(1)
    expect(remainingMembers[0]!.userId).toBe(OTHER_USER_ID)
  })

  it("clears creator reference when user was the org creator", async () => {
    const { organizations, memberships, testLayers } = createTestLayers()
    seedOrganization(organizations, ORG_1, USER_ID)
    seedMembership(memberships, ORG_1, USER_ID)
    seedMembership(memberships, ORG_1, OTHER_USER_ID)

    await Effect.runPromise(cleanupUserMembershipsUseCase({ userId: USER_ID }).pipe(Effect.provide(testLayers)))

    expect(organizations.get(ORG_1)!.creatorId).toBeNull()
  })

  it("handles multiple organizations", async () => {
    const { organizations, memberships, testLayers } = createTestLayers()

    // ORG_1: user is sole member → should be deleted
    seedOrganization(organizations, ORG_1, USER_ID)
    seedMembership(memberships, ORG_1, USER_ID)

    // ORG_2: user has co-members → only membership removed
    seedOrganization(organizations, ORG_2)
    seedMembership(memberships, ORG_2, USER_ID)
    seedMembership(memberships, ORG_2, OTHER_USER_ID)

    await Effect.runPromise(cleanupUserMembershipsUseCase({ userId: USER_ID }).pipe(Effect.provide(testLayers)))

    expect(organizations.has(ORG_1)).toBe(false)
    expect(organizations.has(ORG_2)).toBe(true)

    // ORG_2 membership for USER_ID should be removed
    const org2Members = [...memberships.values()].filter((m) => m.organizationId === ORG_2)
    expect(org2Members).toHaveLength(1)
    expect(org2Members[0]!.userId).toBe(OTHER_USER_ID)

    // ORG_1 membership may still exist in fake (no cascade), but the org is gone
    // In a real DB, cascade would remove it too
  })

  it("is a no-op when user has no memberships", async () => {
    const { organizations, memberships, testLayers } = createTestLayers()

    await Effect.runPromise(cleanupUserMembershipsUseCase({ userId: USER_ID }).pipe(Effect.provide(testLayers)))

    expect(organizations.size).toBe(0)
    expect(memberships.size).toBe(0)
  })
})
