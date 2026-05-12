/**
 * Pins `cancelInvitationUseCase` to Better Auth's
 * `betterAuth.api.cancelInvitation` (BA 1.6.9,
 * `plugins/organization/routes/crud-invites.mjs:359`):
 *
 *   1. Row stays in place with `status = "canceled"`.
 *   2. Caller must be a member of the invitation's org.
 *   3. Caller must be owner/admin (BA's default `invitation:cancel` permission).
 */
import { OrganizationId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { createInvitation } from "../entities/invitation.ts"
import { createMembership } from "../entities/membership.ts"
import { InvitationRepository } from "../ports/invitation-repository.ts"
import { MembershipRepository } from "../ports/membership-repository.ts"
import { createFakeInvitationRepository, createFakeMembershipRepository } from "../testing/index.ts"
import { cancelInvitationUseCase } from "./cancel-invitation.ts"

const ORG_ID = OrganizationId("iapkf6osmlm7mbw9kulosua4")
const INVITER_USER_ID = UserId("ye9d77pxi50nh1gyqljkffnb")
const ADMIN_USER_ID = UserId("k4qbn7tlpxmadev6xwxvxhpr")
const NON_ADMIN_USER_ID = UserId("xw5utp538a8jocgpazfme469")

const buildLayer = (params: {
  invitationFactory?: () => Effect.Effect<{ id: string; organizationId: string } | undefined>
  isAdmin?: boolean
  isMember?: boolean
}) => {
  const { repository: invitationRepo, invitations } = createFakeInvitationRepository()
  const invitation = createInvitation({
    organizationId: ORG_ID,
    email: "invitee@example.com",
    inviterId: INVITER_USER_ID,
  })
  if (params.invitationFactory === undefined) invitations.set(invitation.id, invitation)

  const { repository: membershipRepo } = createFakeMembershipRepository({
    findByOrganizationAndUser: () =>
      params.isMember === false
        ? Effect.fail(new (require("@domain/shared").NotFoundError)({ entity: "Membership", id: "" }))
        : Effect.succeed(
            createMembership({
              organizationId: ORG_ID,
              userId: ADMIN_USER_ID,
              role: params.isAdmin ? "admin" : "member",
            }),
          ),
    isAdmin: () => Effect.succeed(params.isAdmin ?? true),
  })

  const layer = Layer.mergeAll(
    Layer.succeed(InvitationRepository, invitationRepo),
    Layer.succeed(MembershipRepository, membershipRepo),
    Layer.succeed(SqlClient, createFakeSqlClient()),
  )
  return { layer, invitations, invitation }
}

describe("cancelInvitationUseCase — BA parity", () => {
  it("sets status to `canceled` while keeping the row in place", async () => {
    const { layer, invitations, invitation } = buildLayer({ isAdmin: true })

    await Effect.runPromise(
      cancelInvitationUseCase({ invitationId: invitation.id, requestingUserId: ADMIN_USER_ID }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(invitations.get(invitation.id)?.status).toBe("canceled")
    expect(invitations.has(invitation.id)).toBe(true)
  })

  it("fails with InvitationNotFoundError for an unknown invitation id", async () => {
    const { repository: invitationRepo } = createFakeInvitationRepository()
    const { repository: membershipRepo } = createFakeMembershipRepository()
    const layer = Layer.mergeAll(
      Layer.succeed(InvitationRepository, invitationRepo),
      Layer.succeed(MembershipRepository, membershipRepo),
      Layer.succeed(SqlClient, createFakeSqlClient()),
    )

    const exit = await Effect.runPromise(
      Effect.exit(
        cancelInvitationUseCase({
          invitationId: createInvitation({
            organizationId: ORG_ID,
            email: "x@example.com",
            inviterId: INVITER_USER_ID,
          }).id,
          requestingUserId: ADMIN_USER_ID,
        }).pipe(Effect.provide(layer)),
      ),
    )

    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      expect(JSON.stringify(exit.cause.toJSON())).toContain("InvitationNotFoundError")
    }
  })

  it("fails with MembershipNotFoundError when the caller isn't a member of the invitation's org", async () => {
    const { layer, invitation } = buildLayer({ isMember: false })

    const exit = await Effect.runPromise(
      Effect.exit(
        cancelInvitationUseCase({ invitationId: invitation.id, requestingUserId: NON_ADMIN_USER_ID }).pipe(
          Effect.provide(layer),
        ),
      ),
    )

    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      expect(JSON.stringify(exit.cause.toJSON())).toContain("MembershipNotFoundError")
    }
  })

  it("fails with NotAdminError when the caller is a member but not admin/owner", async () => {
    const { layer, invitation } = buildLayer({ isAdmin: false })

    const exit = await Effect.runPromise(
      Effect.exit(
        cancelInvitationUseCase({ invitationId: invitation.id, requestingUserId: NON_ADMIN_USER_ID }).pipe(
          Effect.provide(layer),
        ),
      ),
    )

    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      expect(JSON.stringify(exit.cause.toJSON())).toContain("NotAdminError")
    }
  })
})
