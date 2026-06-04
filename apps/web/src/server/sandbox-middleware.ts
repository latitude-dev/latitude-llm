import { OrganizationId, UserId } from "@domain/shared"
import { createMiddleware } from "@tanstack/react-start"
import { authorizeSandboxAccess } from "../domains/sandbox/sandbox-access.functions.ts"

/**
 * Test Mode sandbox guard for `/sandbox/:sandboxOrgId` server functions.
 *
 * Mirrors `adminMiddleware` (see `admin-middleware.ts`): the heavy lifting
 * (session, DB lookups, membership check) lives in a server fn
 * (`authorizeSandboxAccess`) whose body the TanStack Start Vite compiler
 * strips on the client, so this file stays free of Node-only module-level
 * imports — exactly the leak `.agents/skills/backoffice/SKILL.md` warns
 * against. `adminMiddleware` similarly delegates session work to
 * `getFreshSession` rather than importing `@platform/db-postgres` directly.
 *
 * The "createSandboxServerFn wrapper" from the spec is realised as this
 * middleware, exactly as the "createAdminServerFn pattern" is realised as
 * `adminMiddleware` — a `createServerFn` factory cannot be used because the
 * Vite plugin only recognises the literal `createServerFn(...).handler(...)`
 * chain at the call site; hiding it behind a factory leaks server-only
 * imports into the client bundle. Handlers attach the middleware at the
 * call site:
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
 */

interface ResolvedSandbox {
  readonly organizationId: OrganizationId
  readonly name: string
  readonly parentOrgId: OrganizationId
}

interface SandboxAccess {
  readonly userId: UserId
  readonly sandbox: ResolvedSandbox
}

export const sandboxMiddleware = createMiddleware({ type: "function" }).server(async (rawArgs) => {
  const data = (
    rawArgs as unknown as {
      readonly data?: { readonly sandboxOrgId?: unknown }
    }
  ).data
  const dto = await authorizeSandboxAccess({
    data: { sandboxOrgId: data?.sandboxOrgId },
  })
  const access: SandboxAccess = {
    userId: UserId(dto.userId),
    sandbox: {
      organizationId: OrganizationId(dto.sandbox.organizationId),
      name: dto.sandbox.name,
      parentOrgId: OrganizationId(dto.sandbox.parentOrgId),
    },
  }
  return rawArgs.next({
    context: { userId: access.userId, sandbox: access.sandbox },
  })
})
