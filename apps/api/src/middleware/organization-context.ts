import type { Organization } from "@domain/organizations"
import { type OrganizationId, PermissionError } from "@domain/shared-kernel"
import { BadRequestError } from "@domain/shared-kernel"
import { createOrganizationPostgresRepository } from "@platform/db-postgres"
import { Effect } from "effect"
import type { Context, MiddlewareHandler, Next } from "hono"
import type { AuthContext } from "../types.ts"

export const createOrganizationContextMiddleware = (paramName: string): MiddlewareHandler => {
  return async (c: Context, next: Next) => {
    const organizationIdParam = c.req.param(paramName)

    if (!organizationIdParam) {
      throw new BadRequestError({ httpMessage: "Organization ID is required" })
    }

    const auth = c.get("auth") as AuthContext | undefined
    if (auth && auth.organizationId !== organizationIdParam) {
      throw new PermissionError({
        message: "You do not have access to this organization",
        workspaceId: organizationIdParam,
      })
    }

    const organizationRepository = createOrganizationPostgresRepository(c.get("db"))
    const organization = await Effect.runPromise(organizationRepository.findById(organizationIdParam as OrganizationId))

    if (!organization) {
      throw new BadRequestError({ httpMessage: "Organization not found" })
    }

    c.set("organization", organization as Organization)
    await next()
  }
}
