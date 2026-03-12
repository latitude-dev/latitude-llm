import { AuthIntentRepository, createInviteIntentUseCase } from "@domain/auth"
import { MembershipRepository, OrganizationRepository, removeMemberUseCase } from "@domain/organizations"
import {
  AuthIntentRepositoryLive,
  MembershipRepositoryLive,
  OrganizationRepositoryLive,
  UserRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient } from "../../server/clients.ts"
import { errorHandler } from "../../server/middlewares.ts"
import { ensureSession } from "../sessions/session.functions.ts"

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
    const client = getPostgresClient()

    const [members, pendingInvites] = await Effect.runPromise(
      Effect.gen(function* () {
        const membershipRepo = yield* MembershipRepository
        const intentRepo = yield* AuthIntentRepository
        const members = yield* membershipRepo.findMembersWithUser(organizationId)
        const pendingInvites = yield* intentRepo.findPendingInvitesByOrganizationId(organizationId)

        return [members, pendingInvites] as const
      }).pipe(withPostgres(Layer.mergeAll(MembershipRepositoryLive, AuthIntentRepositoryLive), client, organizationId)),
    )

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
        role: "member",
        status: "invited" as const,
        confirmedAt: null,
        createdAt: invite.createdAt.toISOString(),
      }))

    return [...activeMembers, ...invitedMembers]
  })

export const inviteMember = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(z.object({ email: z.string().email() }))
  .handler(async ({ data }): Promise<{ intentId: string }> => {
    const session = await ensureSession()
    const { organizationId } = await requireSession()
    const inviterName = session.user.name ?? "Someone"
    const client = getPostgresClient()
    const org = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* OrganizationRepository
        return yield* repo.findById(organizationId)
      }).pipe(withPostgres(OrganizationRepositoryLive, client, organizationId)),
    )
    const organizationName = org.name

    const intent = await Effect.runPromise(
      createInviteIntentUseCase({
        email: data.email,
        organizationId,
        organizationName,
        inviterName,
      }).pipe(withPostgres(Layer.mergeAll(AuthIntentRepositoryLive, UserRepositoryLive), client, organizationId)),
    )

    return { intentId: intent.id }
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
