import { AuthIntentRepository, AuthUserRepository, createInviteIntentUseCase } from "@domain/auth"
import { MembershipRepository, removeMemberUseCase } from "@domain/organizations"
import { OrganizationId } from "@domain/shared"
import {
  createAuthIntentPostgresRepository,
  createAuthUserPostgresRepository,
  createMembershipPostgresRepository,
  createOrganizationPostgresRepository,
  runCommand,
} from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { zodValidator } from "@tanstack/zod-adapter"
import { Effect } from "effect"
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
    const { db } = getPostgresClient()

    return runCommand(
      db,
      organizationId,
    )(async (txDb) => {
      const membershipRepo = createMembershipPostgresRepository(txDb)
      const intentRepo = createAuthIntentPostgresRepository(txDb)

      const [members, pendingInvites] = await Promise.all([
        Effect.runPromise(membershipRepo.findMembersWithUser(OrganizationId(organizationId))),
        Effect.runPromise(intentRepo.findPendingInvitesByOrganizationId(organizationId)),
      ])

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
  })

export const inviteMember = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(zodValidator(z.object({ email: z.string().email() })))
  .handler(async ({ data }): Promise<{ intentId: string }> => {
    const session = await ensureSession()
    const { organizationId } = await requireSession()

    const inviterName = session.user.name ?? "Someone"
    const { db } = getPostgresClient()

    const intent = await runCommand(
      db,
      organizationId,
    )(async (txDb) => {
      const orgs = createOrganizationPostgresRepository(txDb)
      const org = await Effect.runPromise(orgs.findById(OrganizationId(organizationId)))
      const organizationName = org.name

      return Effect.runPromise(
        createInviteIntentUseCase({
          email: data.email,
          organizationId,
          organizationName,
          inviterName,
        }).pipe(
          Effect.provideService(AuthIntentRepository, createAuthIntentPostgresRepository(txDb)),
          Effect.provideService(AuthUserRepository, createAuthUserPostgresRepository(txDb)),
        ),
      )
    })

    return { intentId: intent.id }
  })

export const removeMember = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(zodValidator(z.object({ membershipId: z.string() })))
  .handler(async ({ data }): Promise<void> => {
    const { userId, organizationId } = await requireSession()
    const { db } = getPostgresClient()

    await runCommand(
      db,
      organizationId,
    )(async (txDb) =>
      Effect.runPromise(
        removeMemberUseCase({
          membershipId: data.membershipId,
          requestingUserId: userId,
        }).pipe(Effect.provideService(MembershipRepository, createMembershipPostgresRepository(txDb))),
      ),
    )
  })
