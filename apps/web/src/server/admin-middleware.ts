import { NotFoundError, UserId } from "@domain/shared"
import type { User } from "@platform/db-postgres"
import { createMiddleware } from "@tanstack/react-start"
import { getFreshSession, getSession } from "../domains/sessions/session.functions.ts"
import { assertAdminUser } from "./admin-auth.ts"

/**
 * Backoffice guard middlewares for `createServerFn` handlers.
 *
 * Design note — why two middlewares and not one:
 *
 * The "admin" guard and the "currently impersonating" guard are
 * structurally different. During an active impersonation the session
 * cookie points at the TARGET user — `session.user.role` is whatever
 * the target's role is (usually `"user"`), not `"admin"`. So the
 * `stopImpersonating` endpoint would be rejected by an admin-role
 * check even though that's exactly the call the admin needs to make
 * to exit impersonation. The correct guard for that endpoint is "is
 * `session.impersonatedBy` set?" — which is only ever true inside an
 * impersonation session, and from which the admin's id is recovered.
 *
 * Every other backoffice RPC uses {@link adminMiddleware}; the sole
 * exception is {@link impersonatingMiddleware} on `stopImpersonating`.
 *
 * Both middlewares collapse failure to `NotFoundError` so the error
 * shape stays indistinguishable from hitting any non-existent server
 * function — the same fingerprint-preservation discipline as the
 * route `notFound()` guard (see `.agents/skills/backoffice/SKILL.md`).
 *
 * This file lives alongside `admin-auth.ts` rather than inside a
 * `.functions.ts` module so the TanStack Start Vite compiler handles
 * the `createMiddleware(...).server(...)` shape it recognises, and
 * strips the Node-only transitive imports out of the browser bundle.
 */

/**
 * Gate for admin-only backoffice server functions.
 *
 * Fetches the session with Better Auth's cookie cache bypassed (see
 * `getFreshSession`) so DB-level role demotions take effect on the
 * next request, not 5 minutes later. Forwards `{ adminUserId, user }`
 * into the handler's context so handlers can write audit events and
 * reference the admin identity without re-fetching.
 */
export const adminMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const session = await getFreshSession()
  const user = session?.user as (User & { role?: string | null }) | undefined
  assertAdminUser(user)
  return next({ context: { adminUserId: UserId(user.id), user } })
})

/**
 * Gate for {@link stopImpersonating}. Requires an active impersonation
 * session (`session.impersonatedBy` set) — the admin's role is
 * intentionally NOT checked here because during impersonation the
 * current session user is the target, whose role is usually `"user"`.
 *
 * Forwards the admin id (recovered from `impersonatedBy` before
 * Better Auth swaps it back) and the target id into the handler's
 * context so the audit-event payload can reference both sides.
 *
 * The cookie cache is fine here: `impersonatedBy` is written by
 * Better Auth during the impersonation flow and is stable for the
 * lifetime of that session. Unlike `role`, it is not something a DB
 * operator would change out-of-band.
 */
export const impersonatingMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const session = await getSession()
  const adminUserId = (session?.session as { impersonatedBy?: string | null } | undefined)?.impersonatedBy ?? null
  if (!session || !adminUserId) {
    throw new NotFoundError({ entity: "Route", id: "backoffice" })
  }
  return next({
    context: {
      adminUserId: UserId(adminUserId),
      targetUserId: UserId(session.user.id),
    },
  })
})
