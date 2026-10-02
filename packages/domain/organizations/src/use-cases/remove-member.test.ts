import { OrganizationId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { createMembership } from "../entities/membership.ts"
import { MembershipRepository } from "../ports/membership-repository.ts"
import { createFakeMembershipRepository } from "../testing/index.ts"
import { removeMemberUseCase } from "./remove-member.ts"

const ORGANIZATION_ID = OrganizationId("iapkf6osmlm7mbw9kulosua4")
const OWNER_USER_ID = UserId("ye9d77pxi50nh1gyqljkffnb")
const ADMIN_USER_ID = UserId("k4qbn7tlpxmadev6xwxvxhpr")
const MEMBER_USER_ID = UserId("xw5utp538a8jocgpazfme469")
const ANOTHER_MEMBER_USER_ID = UserId("a1b2c3d4e5f6g7h8i9j0k1l2")

const buildFixture = () => {
  const { repository, memberships } = createFakeMembershipRepository()
  repository.isAdmin = (organizationId, userId) =>
    Effect.succeed(
      [...memberships.values()].some(
        (membership) =>
          membership.organizationId === organizationId &&
          membership.userId === userId &&
          (membership.role === "owner" || membership.role === "admin"),
      ),
    )
  const layer = Layer.mergeAll(
    Layer.succeed(MembershipRepository, repository),
    Layer.succeed(SqlClient, createFakeSqlClient()),
  )
  const seedMembership = (userId: UserId, role: "owner" | "admin" | "member") => {
    const membership = createMembership({ organizationId: ORGANIZATION_ID, userId, role })
    memberships.set(membership.id, membership)
    return membership
  }

  return { layer, memberships, seedMembership }
}

describe("removeMemberUseCase", () => {
  it("does not let a non-admin remove an admin or another member", async () => {
    const { layer, memberships, seedMembership } = buildFixture()
    seedMembership(MEMBER_USER_ID, "member")
    const admin = seedMembership(ADMIN_USER_ID, "admin")
    const member = seedMembership(ANOTHER_MEMBER_USER_ID, "member")

    const adminResult = await Effect.runPromise(
      Effect.exit(
        removeMemberUseCase({ membershipId: admin.id, requestingUserId: MEMBER_USER_ID }).pipe(Effect.provide(layer)),
      ),
    )
    const memberResult = await Effect.runPromise(
      Effect.exit(
        removeMemberUseCase({ membershipId: member.id, requestingUserId: MEMBER_USER_ID }).pipe(Effect.provide(layer)),
      ),
    )

    expect(JSON.stringify(adminResult.toJSON())).toContain("NotAdminError")
    expect(JSON.stringify(memberResult.toJSON())).toContain("NotAdminError")
    expect(memberships.has(admin.id)).toBe(true)
    expect(memberships.has(member.id)).toBe(true)
  })

  it("lets an admin remove a member", async () => {
    const { layer, memberships, seedMembership } = buildFixture()
    seedMembership(ADMIN_USER_ID, "admin")
    const member = seedMembership(MEMBER_USER_ID, "member")

    await Effect.runPromise(
      removeMemberUseCase({ membershipId: member.id, requestingUserId: ADMIN_USER_ID }).pipe(Effect.provide(layer)),
    )

    expect(memberships.has(member.id)).toBe(false)
  })

  it("does not let an admin remove an owner", async () => {
    const { layer, memberships, seedMembership } = buildFixture()
    seedMembership(ADMIN_USER_ID, "admin")
    const owner = seedMembership(OWNER_USER_ID, "owner")

    const result = await Effect.runPromise(
      Effect.exit(
        removeMemberUseCase({ membershipId: owner.id, requestingUserId: ADMIN_USER_ID }).pipe(Effect.provide(layer)),
      ),
    )

    expect(JSON.stringify(result.toJSON())).toContain("CannotRemoveOwnerError")
    expect(memberships.has(owner.id)).toBe(true)
  })

  it("does not let an admin remove themselves", async () => {
    const { layer, memberships, seedMembership } = buildFixture()
    const admin = seedMembership(ADMIN_USER_ID, "admin")

    const result = await Effect.runPromise(
      Effect.exit(
        removeMemberUseCase({ membershipId: admin.id, requestingUserId: ADMIN_USER_ID }).pipe(Effect.provide(layer)),
      ),
    )

    expect(JSON.stringify(result.toJSON())).toContain("CannotRemoveSelfError")
    expect(memberships.has(admin.id)).toBe(true)
  })
})
