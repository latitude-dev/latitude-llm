import { UserId } from "@domain/shared"
import {
  createMembershipPostgresRepository,
  createOrganizationPostgresRepository,
  runCommand,
} from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient } from "../../server/clients.ts"
import type { OrganizationRecord } from "./organizations.types.ts"

export const listOrganizations = createServerFn({ method: "GET" }).handler(async (): Promise<OrganizationRecord[]> => {
  const { userId } = await requireSession()
  const { db } = getPostgresClient()
  const domainUserId = UserId(userId)

  const { memberships, organizations } = await runCommand(db)(async (txDb) => {
    const membershipsRepo = createMembershipPostgresRepository(txDb)
    const organizationsRepo = createOrganizationPostgresRepository(txDb)

    const [memberships, organizations] = await Promise.all([
      Effect.runPromise(membershipsRepo.findByUserId(domainUserId)),
      Effect.runPromise(organizationsRepo.findByUserId(domainUserId)),
    ])

    return { memberships, organizations }
  })

  const roleByOrganizationId = new Map(memberships.map((membership) => [membership.organizationId, membership.role]))
  return organizations.flatMap((organization) => {
    const role = roleByOrganizationId.get(organization.id)
    if (!role) {
      return []
    }

    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role,
    } satisfies OrganizationRecord
  })
})
