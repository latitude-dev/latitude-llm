import { createMembership, MembershipRepository } from "@domain/organizations"
import { createFakeMembershipRepository } from "@domain/organizations/testing"
import { ForbiddenError, MembershipId, OrganizationId, SqlClient, type SqlClientShape, UserId } from "@domain/shared"
import { Effect, Exit, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { requireOrganizationOwner } from "./require-owner.ts"

const ORG = OrganizationId("a".repeat(24))
const OWNER = UserId("o".repeat(24))
const MEMBER = UserId("m".repeat(24))

const NoopSqlClient = Layer.succeed(SqlClient, {
  organizationId: ORG,
  transaction: (effect: Effect.Effect<unknown, unknown, unknown>) => effect,
  query: () => {
    throw new Error("NoopSqlClient.query was called")
  },
} as unknown as SqlClientShape)

const membershipLayer = (role: "owner" | "member", userId: UserId) => {
  const { repository, memberships } = createFakeMembershipRepository()
  const membership = createMembership({ organizationId: ORG, userId, role })
  memberships.set(membership.id, membership)
  return Layer.mergeAll(Layer.succeed(MembershipRepository, repository), NoopSqlClient)
}

describe("requireOrganizationOwner", () => {
  it("allows the organization owner", async () => {
    const exit = await Effect.runPromiseExit(
      requireOrganizationOwner({
        organizationId: ORG,
        userId: OWNER,
        what: "org-wide agent dispatch integrations",
      }).pipe(Effect.provide(membershipLayer("owner", OWNER))),
    )
    expect(exit).toEqual(Exit.succeed(undefined))
  })

  it("rejects a non-owner member", async () => {
    const exit = await Effect.runPromiseExit(
      requireOrganizationOwner({
        organizationId: ORG,
        userId: MEMBER,
        what: "org-wide agent dispatch integrations",
      }).pipe(Effect.provide(membershipLayer("member", MEMBER))),
    )
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      expect(exit.cause._tag).toBe("Fail")
      if (exit.cause._tag === "Fail") {
        expect(exit.cause.error).toBeInstanceOf(ForbiddenError)
      }
    }
  })
})
