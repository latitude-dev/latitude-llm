import { OrganizationId } from "@domain/shared"
import {
  createMembershipPostgresRepository,
  createOrganizationPostgresRepository,
  runCommand,
} from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { requireSession } from "../../server/auth.ts"
import { getAdminPostgresClient, getPostgresClient } from "../../server/clients.ts"
import { errorHandler } from "../../server/middlewares.ts"

interface OrganizationRecord {
  readonly id: string
  readonly name: string
}

export const countUserOrganizations = createServerFn({ method: "GET" })
  .middleware([errorHandler])
  .handler(async (): Promise<number> => {
    const { userId } = await requireSession()
    const { db } = getAdminPostgresClient()

    return runCommand(db)(async (txDb) => {
      const membershipRepo = createMembershipPostgresRepository(txDb)
      const memberships = await Effect.runPromise(membershipRepo.findByUserId(userId))
      return memberships.length
    })
  })

export const getOrganization = createServerFn({ method: "GET" })
  .middleware([errorHandler])
  .handler(async (): Promise<OrganizationRecord> => {
    const { organizationId } = await requireSession()
    const { db } = getPostgresClient()

    return runCommand(
      db,
      organizationId,
    )(async (txDb) => {
      const orgs = createOrganizationPostgresRepository(txDb)
      const org = await Effect.runPromise(orgs.findById(OrganizationId(organizationId)))
      return { id: org.id, name: org.name }
    })
  })
