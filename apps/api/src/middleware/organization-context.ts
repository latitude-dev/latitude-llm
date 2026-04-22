import { OrganizationRepository } from "@domain/organizations"
import { UnauthorizedError } from "@domain/shared"
import { OrganizationRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect } from "effect"
import type { Context, MiddlewareHandler, Next } from "hono"

/**
 * Resolves the authenticated org from the API key bound to the request and
 * loads the `Organization` entity onto the context. The API key is already
 * scoped to one organization server-side (see `@platform/api-key-auth`), so
 * the `Authorization: Bearer …` header is the single source of truth — we
 * deliberately do NOT read an `:organizationId` path param. That segment was
 * dropped from the public API because it duplicates information the key
 * already carries and invites false-confidence cross-org probing.
 */
export const createOrganizationContextMiddleware = (): MiddlewareHandler => {
  return async (c: Context, next: Next) => {
    const auth = c.get("auth")
    if (!auth) {
      throw new UnauthorizedError({ message: "Authentication required" })
    }

    const organization = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* OrganizationRepository
        return yield* repo.findById(auth.organizationId)
      }).pipe(withPostgres(OrganizationRepositoryLive, c.var.postgresClient, auth.organizationId), withTracing),
    )

    c.set("organization", organization)
    await next()
  }
}
