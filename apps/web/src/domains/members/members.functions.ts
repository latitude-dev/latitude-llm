import {
  cancelInvitationUseCase,
  inviteMemberUseCase,
  listMembersUseCase,
  removeMemberUseCase,
  transferOwnershipUseCase,
  updateMemberRoleUseCase,
} from "@domain/organizations"
import { InvitationId, MembershipId, UserId } from "@domain/shared"
import { UserRepository } from "@domain/users"
import {
  InvitationRepositoryLive,
  MembershipRepositoryLive,
  OrganizationRepositoryLive,
  OutboxEventWriterLive,
  UserRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient } from "../../server/clients.ts"

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

const requireWebUrl = (): string => {
  const url = process.env.LAT_WEB_URL
  if (!url) throw new Error("LAT_WEB_URL is required to build invitation URLs")
  return url
}

export const listMembers = createServerFn({ method: "GET" }).handler(async (): Promise<MemberRecord[]> => {
  const { organizationId } = await requireSession()
  const client = getPostgresClient()

  const { members, invitations } = await Effect.runPromise(
    listMembersUseCase({ organizationId }).pipe(
      withPostgres(Layer.mergeAll(MembershipRepositoryLive, InvitationRepositoryLive), client, organizationId),
      withTracing,
    ),
  )

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

  const invitedMembers: MemberRecord[] = invitations.map((invite) => ({
    id: invite.id,
    userId: null,
    name: null,
    email: invite.email,
    image: null,
    role: invite.role ?? "member",
    status: "invited" as const,
    confirmedAt: null,
    createdAt: invite.createdAt.toISOString(),
    expiresAt: invite.expiresAt.toISOString(),
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
      }).pipe(withPostgres(MembershipRepositoryLive, client, organizationId), withTracing),
    )
  })

export const invite = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.email(),
    }),
  )
  .handler(async ({ data }): Promise<{ invitationId: string }> => {
    const { userId, organizationId } = await requireSession()
    const client = getPostgresClient()
    const webUrl = requireWebUrl()

    const invitation = await Effect.runPromise(
      Effect.gen(function* () {
        const userRepo = yield* UserRepository
        const inviter = yield* userRepo.findById(UserId(userId))
        const inviterName =
          typeof inviter.name === "string" && inviter.name.trim().length > 0 ? inviter.name.trim() : "A teammate"

        return yield* inviteMemberUseCase({
          organizationId,
          email: data.email,
          inviterUserId: UserId(userId),
          inviterName,
          webUrl,
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(
            MembershipRepositoryLive,
            OrganizationRepositoryLive,
            InvitationRepositoryLive,
            UserRepositoryLive,
            OutboxEventWriterLive,
          ),
          client,
          organizationId,
        ),
        withTracing,
      ),
    )

    return { invitationId: invitation.id }
  })

export const cancelInvite = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      inviteId: z.string(),
    }),
  )
  .handler(async ({ data }): Promise<void> => {
    const { userId, organizationId } = await requireSession()
    const client = getPostgresClient()

    await Effect.runPromise(
      cancelInvitationUseCase({
        invitationId: InvitationId(data.inviteId),
        requestingUserId: UserId(userId),
      }).pipe(
        withPostgres(Layer.mergeAll(InvitationRepositoryLive, MembershipRepositoryLive), client, organizationId),
        withTracing,
      ),
    )
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
      }).pipe(withPostgres(MembershipRepositoryLive, client, organizationId), withTracing),
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
      }).pipe(withPostgres(MembershipRepositoryLive, client, organizationId), withTracing),
    )
  })
