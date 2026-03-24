import {
  createMembership,
  createOrganization,
  MembershipRepository,
  OrganizationRepository,
} from "@domain/organizations"
import { createFakeMembershipRepository, createFakeOrganizationRepository } from "@domain/organizations/testing"
import { OrganizationId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { User } from "../entities/user.ts"
import { UserRepository } from "../ports/user-repository.ts"
import { createFakeUserRepository } from "../testing/fake-user-repository.ts"
import { deleteUserUseCase } from "./delete-user.ts"

const USER_ID = "user_1"
const ORG_ID = OrganizationId("org_1")

const createTestUser = (id: string): User => ({
  id: UserId(id),
  email: `${id}@example.com`,
  name: "Test User",
  emailVerified: true,
  image: null,
  role: "user",
  banned: false,
  createdAt: new Date(),
})

const createTestLayers = () => {
  const { repository: userRepo, users } = createFakeUserRepository()
  const { repository: orgRepo, organizations } = createFakeOrganizationRepository()
  const { repository: membershipRepo, memberships } = createFakeMembershipRepository()
  const fakeSqlClient = createFakeSqlClient()

  const testLayers = Layer.mergeAll(
    Layer.succeed(UserRepository, userRepo),
    Layer.succeed(OrganizationRepository, orgRepo),
    Layer.succeed(MembershipRepository, membershipRepo),
    Layer.succeed(SqlClient, fakeSqlClient),
  )

  return { users, organizations, memberships, testLayers }
}

describe("deleteUserUseCase", () => {
  it("deletes the user record", async () => {
    const { users, testLayers } = createTestLayers()
    users.set(USER_ID, createTestUser(USER_ID))

    await Effect.runPromise(deleteUserUseCase({ userId: USER_ID }).pipe(Effect.provide(testLayers)))

    expect(users.has(USER_ID)).toBe(false)
  })

  it("cleans up memberships and sole-member orgs before deleting user", async () => {
    const { users, organizations, memberships, testLayers } = createTestLayers()
    users.set(USER_ID, createTestUser(USER_ID))

    const org = createOrganization({ id: ORG_ID, name: "Solo Org", slug: "solo-org", creatorId: UserId(USER_ID) })
    organizations.set(ORG_ID, org)

    const m = createMembership({ organizationId: ORG_ID, userId: UserId(USER_ID), role: "owner" })
    memberships.set(m.id, m)

    await Effect.runPromise(deleteUserUseCase({ userId: USER_ID }).pipe(Effect.provide(testLayers)))

    expect(users.has(USER_ID)).toBe(false)
    expect(organizations.has(ORG_ID)).toBe(false)
  })

  it("works when user has no memberships", async () => {
    const { users, testLayers } = createTestLayers()
    users.set(USER_ID, createTestUser(USER_ID))

    await Effect.runPromise(deleteUserUseCase({ userId: USER_ID }).pipe(Effect.provide(testLayers)))

    expect(users.has(USER_ID)).toBe(false)
  })
})
