import {
  createMembership,
  createOrganization,
  MembershipRepository,
  OrganizationRepository,
} from "@domain/organizations"
import { createFakeMembershipRepository, createFakeOrganizationRepository } from "@domain/organizations/testing"
import { MembershipId, OrganizationId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { User } from "../entities/user.ts"
import { UserRepository } from "../ports/user-repository.ts"
import { createFakeUserRepository } from "../testing/fake-user-repository.ts"
import { getAccountUseCase } from "./get-account.ts"

const ORG_ID = OrganizationId("iapkf6osmlm7mbw9kulosua4")
const USER_ID = UserId("ye9d77pxi50nh1gyqljkffnb")
const MEMBERSHIP_ID = MembershipId("k4qbn7tlpxmadev6xwxvxhpr")

const testUser: User = {
  id: USER_ID,
  email: "alice@example.com",
  name: "Alice",
  jobTitle: null,
  emailVerified: true,
  image: null,
  role: "user",
  createdAt: new Date("2026-01-01T00:00:00Z"),
}

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

const seed = (testLayers: ReturnType<typeof createTestLayers>) => {
  testLayers.users.set(USER_ID, testUser)
  testLayers.organizations.set(
    ORG_ID,
    createOrganization({ id: ORG_ID, name: "Acme Inc.", slug: "acme-inc", logo: null, metadata: null, settings: null }),
  )
  testLayers.memberships.set(
    MEMBERSHIP_ID,
    createMembership({ id: MEMBERSHIP_ID, organizationId: ORG_ID, userId: USER_ID, role: "admin" }),
  )
}

describe("getAccountUseCase", () => {
  it("returns user, organization, and role for OAuth callers (real user)", async () => {
    const layers = createTestLayers()
    seed(layers)

    const result = await Effect.runPromise(
      getAccountUseCase({ organizationId: ORG_ID, userId: USER_ID }).pipe(Effect.provide(layers.testLayers)),
    )

    expect(result.user?.id).toBe(USER_ID)
    expect(result.user?.email).toBe("alice@example.com")
    expect(result.organization.id).toBe(ORG_ID)
    expect(result.organization.name).toBe("Acme Inc.")
    expect(result.role).toBe("admin")
  })

  it("returns only the organization for API-key callers (no user)", async () => {
    const layers = createTestLayers()
    seed(layers)

    const result = await Effect.runPromise(
      getAccountUseCase({ organizationId: ORG_ID, userId: null }).pipe(Effect.provide(layers.testLayers)),
    )

    expect(result.user).toBeNull()
    expect(result.organization.id).toBe(ORG_ID)
    expect(result.role).toBeNull()
  })

  it("fails with NotFoundError when the organization doesn't exist", async () => {
    const layers = createTestLayers()
    // No seed — repos are empty.

    const exit = await Effect.runPromise(
      Effect.exit(getAccountUseCase({ organizationId: ORG_ID, userId: null }).pipe(Effect.provide(layers.testLayers))),
    )

    expect(exit._tag).toBe("Failure")
  })

  it("fails when the user exists but isn't a member of the organization", async () => {
    const layers = createTestLayers()
    layers.users.set(USER_ID, testUser)
    layers.organizations.set(
      ORG_ID,
      createOrganization({
        id: ORG_ID,
        name: "Acme Inc.",
        slug: "acme-inc",
        logo: null,
        metadata: null,
        settings: null,
      }),
    )
    // No membership seeded.

    const exit = await Effect.runPromise(
      Effect.exit(
        getAccountUseCase({ organizationId: ORG_ID, userId: USER_ID }).pipe(Effect.provide(layers.testLayers)),
      ),
    )

    expect(exit._tag).toBe("Failure")
  })
})
