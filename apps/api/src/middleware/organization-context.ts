import { OrganizationId, PermissionError } from "@domain/shared"
import { BadRequestError } from "@domain/shared"
import { createOrganizationPostgresRepository } from "@platform/db-postgres"
import { Effect } from "effect"
import type { Context, MiddlewareHandler, Next } from "hono"

/**
 * Resolves and attaches the organization from a route parameter.
 *
 * The middleware validates that the organization ID param exists, enforces
 * authenticated organization access when auth context is present, loads the
 * organization from the repository, and stores it on `c.var.organization`.
 */
export const createOrganizationContextMiddleware = (): MiddlewareHandler => {
  return async (c: Context, next: Next) => {
    const organizationIdParam = c.req.param("organizationId")
    if (!organizationIdParam) {
      throw new BadRequestError({ httpMessage: "Organization ID is required" })
    }

    const auth = c.get("auth")
    if (auth && auth.organizationId !== organizationIdParam) {
      throw new PermissionError({
        message: "You do not have access to this organization",
        workspaceId: organizationIdParam,
      })
    }

    const organizationRepository = createOrganizationPostgresRepository(c.var.db)
    const organization = await Effect.runPromise(organizationRepository.findById(OrganizationId(organizationIdParam)))

    if (!organization) {
      throw new BadRequestError({ httpMessage: "Organization not found" })
    }

    c.set("organization", organization)
    await next()
  }
}
