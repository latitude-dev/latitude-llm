import { OrganizationId, UnauthorizedError, UserId } from "@domain/shared"
import { createMiddleware } from "@tanstack/react-start"
import { getFreshSession } from "../domains/sessions/session.functions.ts"

/**
 * Test Mode sandbox guard for `/sandbox/:sandboxOrgId` server functions.
 *
 * Handlers attach the middleware at the call site:
 *
 * ```ts
 * createServerFn({ method: "GET" })
 *   .middleware([sandboxMiddleware])
 *   .inputValidator(z.object({ sandboxOrgId: organizationIdSchema }))
 *   .handler(async ({ context }) => context.sandbox.name)
 * ```
 *
 * The structural guarantee: the handler's `context` carries only the
 * resolved, sandbox-scoped `sandbox` (plus the requesting `userId`). The
 * browser session's `activeOrganizationId` is never injected and never
 * changes, so a handler in this namespace cannot accidentally act on the
 * live parent org — it has no handle to reach it.
 *
 * Never route the authorization through a server fn referenced only from here:
 * Start's server-fn manifest is built from client references, so such a fn has
 * no manifest entry and every call throws "Server function info not found".
 * `resolveSandboxAccess` is imported dynamically inside `.server()` so its
 * Node-only imports never reach the browser bundle.
 */
export const sandboxMiddleware = createMiddleware({ type: "function" }).server(async (rawArgs) => {
  const data = (
    rawArgs as unknown as {
      readonly data?: { readonly sandboxOrgId?: unknown }
    }
  ).data
  const session = await getFreshSession()
  if (!session) {
    throw new UnauthorizedError({ message: "Unauthorized" })
  }
  const userId = UserId(session.user.id)
  const { resolveSandboxAccess } = await import("./sandbox-access.ts")
  const sandbox = await resolveSandboxAccess({ sandboxOrgId: data?.sandboxOrgId, userId })
  return rawArgs.next({
    context: {
      userId,
      sandbox: {
        organizationId: OrganizationId(sandbox.organizationId),
        name: sandbox.name,
        parentOrgId: OrganizationId(sandbox.parentOrgId),
        status: sandbox.status,
      },
    },
  })
})
