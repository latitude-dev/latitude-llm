import {
  MembershipRepository,
  removeMemberUseCase,
  transferOwnershipUseCase,
  updateMemberRoleUseCase,
} from "@domain/organizations"
import { MembershipId, UserId } from "@domain/shared"
import { MembershipRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getBetterAuth, getPostgresClient } from "../../server/clients.ts"

export type MemberStatus = "active" | "invited"

export interface MemberRecord {
  readonly id: string
  readonly userId: string | null
  readonly name: string | null
  readonly email: string
  readonly image: string | null
  readonly role: string
  readonly status: MemberStatus
  readonly confirmedAt: string | null
  readonly createdAt: string
  readonly expiresAt?: string | null
}

export const listMembers = createServerFn({ method: "GET" }).handler(async (): Promise<MemberRecord[]> => {
  const { organizationId } = await requireSession()
  const headers = getRequestHeaders()
  const client = getPostgresClient()

  const members = await Effect.runPromise(
    Effect.gen(function* () {
      const membershipRepo = yield* MembershipRepository
      return yield* membershipRepo.listMembersWithUser(organizationId)
    }).pipe(withPostgres(MembershipRepositoryLive, client, organizationId)),
  )

  const invitationResult = await getBetterAuth().api.listInvitations({
    headers,
    query: { organizationId },
  })
  const pendingInvites = invitationResult.filter((invitation) => invitation.status === "pending")

  const activeMembers: MemberRecord[] = members.map((m) => ({
    id: m.id,
    userId: m.userId,
    name: m.name,
    email: m.email,
    image: m.image,
    role: m.role,
    status: "active" as const,
    confirmedAt: m.createdAt ? m.createdAt.toISOString() : null,
    createdAt: m.createdAt ? m.createdAt.toISOString() : new Date().toISOString(),
  }))

  const activeMemberEmails = new Set(activeMembers.map((m) => m.email.toLowerCase()))

  const invitedMembers: MemberRecord[] = pendingInvites
    .filter((invite) => !activeMemberEmails.has(invite.email.toLowerCase()))
    .map((invite) => ({
      id: invite.id,
      userId: null,
      name: null,
      email: invite.email,
      image: null,
      role: invite.role ?? "member",
      status: "invited" as const,
      confirmedAt: null,
      createdAt: new Date(invite.createdAt).toISOString(),
      expiresAt: invite.expiresAt ? new Date(invite.expiresAt).toISOString() : null,
    }))

  return [...activeMembers, ...invitedMembers]
})

export const removeMember = createServerFn({ method: "POST" })
  .inputValidator(z.object({ membershipId: z.string() }))
  .handler(async ({ data }): Promise<void> => {
    const { userId, organizationId } = await requireSession()
    const client = getPostgresClient()

    await Effect.runPromise(
      removeMemberUseCase({
        membershipId: MembershipId(data.membershipId),
        requestingUserId: UserId(userId),
      }).pipe(withPostgres(MembershipRepositoryLive, client, organizationId)),
    )
  })

export const invite = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.email(),
    }),
  )
  .handler(async ({ data }): Promise<{ invitationId: string }> => {
    const { organizationId } = await requireSession()
    const headers = getRequestHeaders()
    const invitation = await getBetterAuth().api.createInvitation({
      headers,
      body: {
        email: data.email,
        role: "member",
        organizationId,
      },
    })

    return { invitationId: invitation.id }
  })

export const cancelInvite = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      inviteId: z.string(),
    }),
  )
  .handler(async ({ data }): Promise<void> => {
    const headers = getRequestHeaders()
    await getBetterAuth().api.cancelInvitation({
      headers,
      body: { invitationId: data.inviteId },
    })
  })

export const transferOwnership = createServerFn({ method: "POST" })
  .inputValidator(z.object({ newOwnerUserId: z.string() }))
  .handler(async ({ data }): Promise<void> => {
    const { userId, organizationId } = await requireSession()
    const client = getPostgresClient()

    await Effect.runPromise(
      transferOwnershipUseCase({
        organizationId,
        currentOwnerUserId: userId,
        newOwnerUserId: UserId(data.newOwnerUserId),
      }).pipe(withPostgres(MembershipRepositoryLive, client, organizationId)),
    )
  })

export const updateMemberRole = createServerFn({ method: "POST" })
  .inputValidator(z.object({ targetUserId: z.string(), newRole: z.enum(["admin", "member"]) }))
  .handler(async ({ data }): Promise<void> => {
    const { userId, organizationId } = await requireSession()
    const client = getPostgresClient()

    await Effect.runPromise(
      updateMemberRoleUseCase({
        organizationId,
        requestingUserId: userId,
        targetUserId: UserId(data.targetUserId),
        newRole: data.newRole,
      }).pipe(withPostgres(MembershipRepositoryLive, client, organizationId)),
    )
  })
