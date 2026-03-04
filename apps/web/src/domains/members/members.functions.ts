import { removeMemberUseCase } from "@domain/organizations"
import { OrganizationId } from "@domain/shared"
import { createMembershipPostgresRepository, findMembersWithUser, runCommand } from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { zodValidator } from "@tanstack/zod-adapter"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient } from "../../server/clients.ts"

export interface MemberRecord {
  readonly id: string
  readonly userId: string
  readonly name: string | null
  readonly email: string
  readonly role: string
  readonly confirmedAt: string | null
  readonly createdAt: string
}

export const listMembers = createServerFn({ method: "GET" })
  .inputValidator(zodValidator(z.object({})))
  .handler(async (): Promise<MemberRecord[]> => {
    const { organizationId } = await requireSession()
    const { db } = getPostgresClient()

    return runCommand(db)(async (txDb) => {
      const members = await Effect.runPromise(findMembersWithUser(txDb, organizationId))

      return members.map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.name,
        email: m.email,
        role: m.role,
        confirmedAt: m.createdAt ? m.createdAt.toISOString() : null,
        createdAt: m.createdAt ? m.createdAt.toISOString() : new Date().toISOString(),
      }))
    })
  })

export const removeMember = createServerFn({ method: "POST" })
  .inputValidator(zodValidator(z.object({ membershipId: z.string() })))
  .handler(async ({ data }): Promise<void> => {
    const { userId, organizationId } = await requireSession()
    const { db } = getPostgresClient()

    await runCommand(db)(async (txDb) => {
      const membershipRepo = createMembershipPostgresRepository(txDb)

      await Effect.runPromise(
        removeMemberUseCase(membershipRepo)({
          membershipId: data.membershipId,
          requestingUserId: userId,
          organizationId: OrganizationId(organizationId),
        }),
      )
    })
  })
