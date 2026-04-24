import { getUserDetailsUseCase } from "@domain/admin"
import { generateId, UserId } from "@domain/shared"
import { AdminUserRepositoryLive, SqlClientLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { Effect } from "effect"
import { z } from "zod"
import { adminMiddleware, impersonatingMiddleware } from "../../server/admin-middleware.ts"
import { getAdminPostgresClient, getBetterAuth, getOutboxWriter } from "../../server/clients.ts"

/**
 * Exported for input-schema tests.
 */
export const impersonateUserInputSchema = z.object({
  userId: z.string().min(1).max(256),
})

/**
 * Start impersonating another user.
 *
 * Guard: {@link adminMiddleware} — the admin's id is injected as
 * `context.adminUserId` so the audit event can reference it without a
 * second session fetch.
 *
 * Flow:
 * 1. Resolve the target's first organisation membership (if any) via
 *    the admin user repository. This also verifies the target exists —
 *    Better Auth would otherwise happily mint an impersonation session
 *    for a nonsense id.
 * 2. Write `AdminImpersonationStarted` to the outbox *before* the
 *    Better Auth swap, so an attempt is recorded even if the swap
 *    fails. Envelope `organizationId` is `"system"` (platform-wide
 *    audit, no tenant ownership).
 * 3. Call `auth.api.impersonateUser`, which rewrites the session
 *    cookie to the target's session and stores the admin's id in
 *    `sessions.impersonatedBy`. Client redirects to `/` on return.
 */
export const impersonateUser = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(impersonateUserInputSchema)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const adminUserId = context.adminUserId

    const target = await Effect.runPromise(
      getUserDetailsUseCase({ userId: UserId(data.userId) }).pipe(
        withPostgres(AdminUserRepositoryLive, getAdminPostgresClient()),
        withTracing,
      ),
    )

    const targetOrganizationId = target.memberships[0]?.organizationId ?? null

    const outboxWriter = getOutboxWriter()
    await Effect.runPromise(
      outboxWriter
        .write({
          id: generateId(),
          eventName: "AdminImpersonationStarted",
          aggregateType: "user",
          aggregateId: target.id,
          organizationId: "system",
          payload: {
            adminUserId,
            targetUserId: target.id,
            targetOrganizationId,
          },
          occurredAt: new Date(),
        })
        .pipe(Effect.provide(SqlClientLive(getAdminPostgresClient())), withTracing),
    )

    const headers = getRequestHeaders()
    const auth = getBetterAuth()
    await auth.api.impersonateUser({ body: { userId: target.id }, headers })

    return { ok: true }
  })

/**
 * Stop an active impersonation and restore the admin's original session.
 *
 * Guard: {@link impersonatingMiddleware} — not `adminMiddleware`.
 * During impersonation the current session user is the *target* (role
 * typically `"user"`), so an admin-role check would reject the call
 * that's supposed to succeed. The middleware instead gates on
 * `session.impersonatedBy` being set, and injects both
 * `context.adminUserId` (recovered from `impersonatedBy` before
 * Better Auth swaps it back) and `context.targetUserId` so the audit
 * event can reference both sides.
 *
 * The audit event is written before `auth.api.stopImpersonating` for
 * the same "record the attempt even if the swap fails" reason as
 * `impersonateUser`.
 */
export const stopImpersonating = createServerFn({ method: "POST" })
  .middleware([impersonatingMiddleware])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const { adminUserId, targetUserId } = context

    const outboxWriter = getOutboxWriter()
    await Effect.runPromise(
      outboxWriter
        .write({
          id: generateId(),
          eventName: "AdminImpersonationStopped",
          aggregateType: "user",
          aggregateId: targetUserId,
          organizationId: "system",
          payload: {
            adminUserId,
            targetUserId,
          },
          occurredAt: new Date(),
        })
        .pipe(Effect.provide(SqlClientLive(getAdminPostgresClient())), withTracing),
    )

    const headers = getRequestHeaders()
    const auth = getBetterAuth()
    await auth.api.stopImpersonating({ headers })

    return { ok: true }
  })
