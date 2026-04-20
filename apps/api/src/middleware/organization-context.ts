import { OrganizationRepository } from "@domain/organizations"
import { BadRequestError, OrganizationId, PermissionError } from "@domain/shared"
import { OrganizationRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect } from "effect"
import type { Context, MiddlewareHandler, Next } from "hono"

export const createOrganizationContextMiddleware = (): MiddlewareHandler => {
  return async (c: Context, next: Next) => {
    const organizationIdParam = c.req.param("organizationId")
    if (!organizationIdParam) {
      throw new BadRequestError({ message: "Organization ID is required" })
    }

    const auth = c.get("auth")
    if (auth && auth.organizationId !== organizationIdParam) {
      throw new PermissionError({
        message: "You do not have access to this organization",
        organizationId: organizationIdParam,
      })
    }

    const organizationId = OrganizationId(organizationIdParam)
    const organization = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* OrganizationRepository
        return yield* repo.findById(organizationId)
      }).pipe(withPostgres(OrganizationRepositoryLive, c.var.postgresClient, organizationId), withTracing),
    )

    c.set("organization", organization)
    await next()
  }
}
