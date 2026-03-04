import { createMembership, createOrganizationUseCase } from "@domain/organizations"
import type { Membership, Organization } from "@domain/organizations"
import { OrganizationId, UserId, generateId } from "@domain/shared"
import {
  createMembershipPostgresRepository,
  createOrganizationPostgresRepository,
  runCommand,
} from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { zodValidator } from "@tanstack/zod-adapter"
import { Effect } from "effect"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient } from "../../server/clients.ts"
import { type OrganizationRecord, createOrganizationInputSchema } from "./organizations.types.ts"

export const listOrganizations = createServerFn({ method: "GET" }).handler(async (): Promise<OrganizationRecord[]> => {
  const { userId } = await requireSession()
  const { db } = getPostgresClient()

  const memberships = await runCommand(db)(async (txDb) => {
    const membershipsRepo = createMembershipPostgresRepository(txDb)
    return Effect.runPromise(membershipsRepo.findByUserId(userId))
  })

  const organizations = await Promise.all(
    memberships.map(async (membership) => {
      const organization = await runCommand(db)(async (txDb) => {
        const organizationsRepo = createOrganizationPostgresRepository(txDb)
        return Effect.runPromise(organizationsRepo.findById(membership.organizationId))
      })

      return {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        role: membership.role,
      } satisfies OrganizationRecord
    }),
  )

  return organizations
})

export const createOrganization = createServerFn({ method: "POST" })
  .inputValidator(zodValidator(createOrganizationInputSchema))
  .handler(async ({ data }): Promise<OrganizationRecord> => {
    const { userId } = await requireSession()
    const { db } = getPostgresClient()
    const organizationId = OrganizationId(generateId())

    return runCommand(db)(async (txDb) => {
      const organizationsRepo = createOrganizationPostgresRepository(txDb)
      const membershipsRepo = createMembershipPostgresRepository(txDb)
      const name = data.name.trim()

      const organization = await Effect.runPromise(
        createOrganizationUseCase(organizationsRepo)({
          id: organizationId,
          name,
          creatorId: UserId(userId),
        }),
      )

      await Effect.runPromise(
        membershipsRepo.save(
          createMembership({
            id: generateId(),
            organizationId: organization.id,
            userId: UserId(userId),
            role: "owner",
            confirmedAt: new Date(),
          }),
        ),
      )

      return {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        role: "owner",
      }
    })
  })
