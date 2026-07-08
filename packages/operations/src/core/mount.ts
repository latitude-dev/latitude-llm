import { OpenAPIHono } from "@hono/zod-openapi"
import type { MiddlewareHandler } from "hono"
import type { OrganizationScopedEnv, ProtectedEnv } from "../types.ts"
import type { AnyOperation, RateLimitTier } from "./define-operation.ts"

/**
 * One module of related operations sharing a mount path (the former
 * `createXxxRoutes` factory, as data). Module order in the manifest and
 * operation order within a module are load-bearing: `openapi.json` path order
 * and `mcp.json` tool order derive from mount order, and Hono matches
 * static-before-param routes by registration order.
 */
export interface OperationModule {
  /** Mount path in Hono form (e.g. `"/projects/:projectSlug/tools"`). */
  readonly path: string
  readonly operations: ReadonlyArray<AnyOperation>
}

/**
 * Mounts every module on `routes` (the sub-app behind auth + org-context
 * middleware), applying the transport middleware for each operation's declared
 * `rateLimitTier`. Throws on a missing tier — the throw also fires during
 * manifest emission (which boots the same route assembly), so an undeclared
 * tier can't ship.
 */
export const mountOperationModules = (
  routes: OpenAPIHono<ProtectedEnv>,
  modules: ReadonlyArray<OperationModule>,
  { middlewareForTier }: { middlewareForTier: (tier: RateLimitTier) => MiddlewareHandler },
): void => {
  for (const mod of modules) {
    const sub = new OpenAPIHono<OrganizationScopedEnv>()
    for (const operation of mod.operations) {
      if (operation.rateLimitTier === undefined) {
        throw new Error(`Operation "${operation.route.name}" declares no rateLimitTier`)
      }
      operation.mountHttp(sub, middlewareForTier(operation.rateLimitTier))
    }
    routes.route(mod.path, sub)
  }
}
