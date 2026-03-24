import { MembershipRepository, removeMemberUseCase } from "@domain/organizations"
import { MembershipRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getBetterAuth, getPostgresClient } from "../../server/clients.ts"
import { errorHandler } from "../../server/middlewares.ts"

export type MemberStatus = "active" | "invited"

export interface MemberRecord {
  readonly id: string
  readonly userId: string | null
  readonly name: string | null
  readonly email: string
  readonly role: string
  readonly status: MemberStatus
  readonly confirmedAt: string | null
  readonly createdAt: string
}

export const listMembers = createServerFn({ method: "GET" })
  .middleware([errorHandler])
  .handler(async (): Promise<MemberRecord[]> => {
    const { organizationId } = await requireSession()
    const headers = getRequestHeaders()
    const client = getPostgresClient()

    const members = await Effect.runPromise(
      Effect.gen(function* () {
        const membershipRepo = yield* MembershipRepository
        return yield* membershipRepo.findMembersWithUser(organizationId)
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
        role: invite.role ?? "member",
        status: "invited" as const,
        confirmedAt: null,
        createdAt: new Date(invite.createdAt).toISOString(),
      }))

    return [...activeMembers, ...invitedMembers]
  })

export const removeMember = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(z.object({ membershipId: z.string() }))
  .handler(async ({ data }): Promise<void> => {
    const { userId, organizationId } = await requireSession()
    const client = getPostgresClient()

    await Effect.runPromise(
      removeMemberUseCase({
        membershipId: data.membershipId,
        requestingUserId: userId,
      }).pipe(withPostgres(MembershipRepositoryLive, client, organizationId)),
    )
  })

export const invite = createServerFn({ method: "POST" })
  .middleware([errorHandler])
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
  .middleware([errorHandler])
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
