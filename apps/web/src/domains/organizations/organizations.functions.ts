import { MembershipRepository, OrganizationRepository } from "@domain/organizations"
import { MembershipRepositoryLive, OrganizationRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { appendFileSync } from "node:fs"
import { requireSession } from "../../server/auth.ts"
import { getAdminPostgresClient, getPostgresClient } from "../../server/clients.ts"
import { errorHandler } from "../../server/middlewares.ts"

interface OrganizationRecord {
  readonly id: string
  readonly name: string
}

const debugLog = (payload: {
  readonly hypothesisId: string
  readonly location: string
  readonly message: string
  readonly data: Record<string, unknown>
}) => {
  appendFileSync("/opt/cursor/logs/debug.log", `${JSON.stringify({ ...payload, timestamp: Date.now() })}\n`)
}

export const countUserOrganizations = createServerFn({ method: "GET" })
  .middleware([errorHandler])
  .handler(async (): Promise<number> => {
    const { userId } = await requireSession()
    const adminClient = getAdminPostgresClient()

    const members = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* MembershipRepository
        return yield* repo.findByUserId(userId)
      }).pipe(withPostgres(MembershipRepositoryLive, adminClient)),
    )
    return members.length
  })

export const getOrganization = createServerFn({ method: "GET" })
  .middleware([errorHandler])
  .handler(async (): Promise<OrganizationRecord> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    const org = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* OrganizationRepository
        return yield* repo.findById(organizationId)
      }).pipe(withPostgres(OrganizationRepositoryLive, client, organizationId)),
    )
    // #region agent log
    debugLog({
      hypothesisId: "E",
      location: "apps/web/src/domains/organizations/organizations.functions.ts:getOrganization",
      message: "getOrganization success",
      data: { organizationId: org.id, organizationName: org.name },
    })
    // #endregion
    return { id: org.id, name: org.name }
  })
