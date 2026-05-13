/**
 * Compatibility tests pinning `inviteMemberUseCase` to Better Auth's
 * `betterAuth.api.createInvitation` behavior (BA 1.6.9,
 * `plugins/organization/routes/crud-invites.mjs:22`). The web's existing
 * invite flow goes through BA; the API's goes through this use-case. The
 * tests below assert the rejection rules and the row shape match so a
 * caller gets the same result on either channel.
 *
 * When BA upgrades, re-read its `createInvitation` and update these tests
 * if the rules diverge.
 */
import { OutboxEventWriter, type OutboxEventWriterShape } from "@domain/events"
import { OrganizationId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { createInvitation } from "../entities/invitation.ts"
import { createMembership } from "../entities/membership.ts"
import { createOrganization } from "../entities/organization.ts"
import { InvitationRepository } from "../ports/invitation-repository.ts"
import { MembershipRepository } from "../ports/membership-repository.ts"
import { OrganizationRepository } from "../ports/organization-repository.ts"
import {
  createFakeInvitationRepository,
  createFakeMembershipRepository,
  createFakeOrganizationRepository,
} from "../testing/index.ts"
import { inviteMemberUseCase, PENDING_INVITATION_LIMIT } from "./invite-member.ts"

const ORG_ID = OrganizationId("iapkf6osmlm7mbw9kulosua4")
const INVITER_USER_ID = UserId("ye9d77pxi50nh1gyqljkffnb")
const ANOTHER_USER_ID = UserId("k4qbn7tlpxmadev6xwxvxhpr")

const baseInput = {
  organizationId: ORG_ID,
  email: "newbie@example.com",
  inviterUserId: INVITER_USER_ID,
  inviterName: "Alice",
  webUrl: "https://app.example.com",
} as const

const writtenEvents: string[] = []

const fakeOutboxWriter: OutboxEventWriterShape = {
  write: (event) =>
    Effect.sync(() => {
      writtenEvents.push(event.eventName)
    }),
}

const buildLayers = () => {
  const { repository: membershipRepo, memberships } = createFakeMembershipRepository({
    findByOrganizationAndUser: () =>
      Effect.succeed(createMembership({ organizationId: ORG_ID, userId: INVITER_USER_ID, role: "admin" })),
    findMemberByEmail: () => Effect.succeed(false),
  })
  const { repository: orgRepo, organizations } = createFakeOrganizationRepository()
  organizations.set(
    ORG_ID,
    createOrganization({ id: ORG_ID, name: "Acme Inc.", slug: "acme-inc", logo: null, metadata: null, settings: null }),
  )
  const { repository: invitationRepo, invitations } = createFakeInvitationRepository()

  const layer = Layer.mergeAll(
    Layer.succeed(MembershipRepository, membershipRepo),
    Layer.succeed(OrganizationRepository, orgRepo),
    Layer.succeed(InvitationRepository, invitationRepo),
    Layer.succeed(OutboxEventWriter, fakeOutboxWriter),
    Layer.succeed(SqlClient, createFakeSqlClient()),
  )

  return { layer, memberships, organizations, invitations }
}

describe("inviteMemberUseCase — Better Auth parity", () => {
  beforeEach(() => {
    writtenEvents.length = 0
  })

  it("creates a pending invitation with BA's default expiry (~48h) and emits the email + analytics events", async () => {
    const layers = buildLayers()

    const before = Date.now()
    const result = await Effect.runPromise(inviteMemberUseCase(baseInput).pipe(Effect.provide(layers.layer)))
    const after = Date.now()

    expect(result.status).toBe("pending")
    expect(result.email).toBe("newbie@example.com")
    expect(result.role).toBe("member")
    expect(result.inviterId).toBe(INVITER_USER_ID)
    expect(result.organizationId).toBe(ORG_ID)

    // BA defaults to `invitationExpiresIn: 3600 * 48` seconds (48h). Allow a
    // small skew window for setup time inside the test.
    const expectedExpiry = before + 48 * 60 * 60 * 1000
    expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedExpiry - 1000)
    expect(result.expiresAt.getTime()).toBeLessThanOrEqual(after + 48 * 60 * 60 * 1000 + 1000)

    expect(layers.invitations.size).toBe(1)
    expect(writtenEvents).toEqual(["InvitationEmailRequested", "MemberInvited"])
  })

  it("normalizes the email to lowercase before write", async () => {
    const layers = buildLayers()

    const result = await Effect.runPromise(
      inviteMemberUseCase({ ...baseInput, email: "Mixed.Case@Example.COM" }).pipe(Effect.provide(layers.layer)),
    )
    expect(result.email).toBe("mixed.case@example.com")
  })

  it("rejects role `owner` with CannotInviteAsOwnerError (web-only via ownership transfer)", async () => {
    const layers = buildLayers()
    const exit = await Effect.runPromise(
      Effect.exit(inviteMemberUseCase({ ...baseInput, role: "owner" }).pipe(Effect.provide(layers.layer))),
    )
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      const error = exit.cause.toJSON() as { _tag?: string; failure?: { _tag?: string } }
      expect(JSON.stringify(error)).toContain("CannotInviteAsOwnerError")
    }
  })

  it("rejects with AlreadyMemberError when the email already belongs to an active member", async () => {
    const { repository: membershipRepo } = createFakeMembershipRepository({
      findByOrganizationAndUser: () =>
        Effect.succeed(createMembership({ organizationId: ORG_ID, userId: INVITER_USER_ID, role: "admin" })),
      findMemberByEmail: () => Effect.succeed(true),
    })
    const { repository: orgRepo, organizations } = createFakeOrganizationRepository()
    organizations.set(
      ORG_ID,
      createOrganization({ id: ORG_ID, name: "Acme", slug: "acme", logo: null, metadata: null, settings: null }),
    )
    const { repository: invitationRepo } = createFakeInvitationRepository()
    const layer = Layer.mergeAll(
      Layer.succeed(MembershipRepository, membershipRepo),
      Layer.succeed(OrganizationRepository, orgRepo),
      Layer.succeed(InvitationRepository, invitationRepo),
      Layer.succeed(OutboxEventWriter, fakeOutboxWriter),
      Layer.succeed(SqlClient, createFakeSqlClient()),
    )

    const exit = await Effect.runPromise(Effect.exit(inviteMemberUseCase(baseInput).pipe(Effect.provide(layer))))
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      expect(JSON.stringify(exit.cause.toJSON())).toContain("AlreadyMemberError")
    }
  })

  it("rejects with AlreadyInvitedError when a pending invitation for the email already exists", async () => {
    const layers = buildLayers()
    layers.invitations.set(
      createInvitation({ organizationId: ORG_ID, email: "newbie@example.com", inviterId: ANOTHER_USER_ID }).id,
      createInvitation({ organizationId: ORG_ID, email: "newbie@example.com", inviterId: ANOTHER_USER_ID }),
    )

    const exit = await Effect.runPromise(Effect.exit(inviteMemberUseCase(baseInput).pipe(Effect.provide(layers.layer))))
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      expect(JSON.stringify(exit.cause.toJSON())).toContain("AlreadyInvitedError")
    }
  })

  it("rejects with InvitationLimitReachedError when the org has 100 pending invitations", async () => {
    const layers = buildLayers()
    for (let i = 0; i < PENDING_INVITATION_LIMIT; i += 1) {
      const inv = createInvitation({
        organizationId: ORG_ID,
        email: `pending-${i}@example.com`,
        inviterId: ANOTHER_USER_ID,
      })
      layers.invitations.set(inv.id, inv)
    }

    const exit = await Effect.runPromise(Effect.exit(inviteMemberUseCase(baseInput).pipe(Effect.provide(layers.layer))))
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      expect(JSON.stringify(exit.cause.toJSON())).toContain("InvitationLimitReachedError")
    }
  })

  it("rejects with MembershipNotFoundError when the inviter isn't a member of the target org", async () => {
    const { repository: membershipRepo } = createFakeMembershipRepository({
      findByOrganizationAndUser: () =>
        Effect.fail(new (require("@domain/shared").NotFoundError)({ entity: "Membership", id: "" })),
      findMemberByEmail: () => Effect.succeed(false),
    })
    const { repository: orgRepo, organizations } = createFakeOrganizationRepository()
    organizations.set(
      ORG_ID,
      createOrganization({ id: ORG_ID, name: "Acme", slug: "acme", logo: null, metadata: null, settings: null }),
    )
    const { repository: invitationRepo } = createFakeInvitationRepository()
    const layer = Layer.mergeAll(
      Layer.succeed(MembershipRepository, membershipRepo),
      Layer.succeed(OrganizationRepository, orgRepo),
      Layer.succeed(InvitationRepository, invitationRepo),
      Layer.succeed(OutboxEventWriter, fakeOutboxWriter),
      Layer.succeed(SqlClient, createFakeSqlClient()),
    )

    const exit = await Effect.runPromise(Effect.exit(inviteMemberUseCase(baseInput).pipe(Effect.provide(layer))))
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      expect(JSON.stringify(exit.cause.toJSON())).toContain("MembershipNotFoundError")
    }
  })
})
