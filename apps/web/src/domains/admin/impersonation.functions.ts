import { getUserDetailsUseCase } from "@domain/admin"
import { generateId, NotFoundError, UserId } from "@domain/shared"
import { AdminUserRepositoryLive, SqlClientLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { Effect } from "effect"
import { z } from "zod"
import { requireAdminSession } from "../../server/admin-auth.ts"
import { getAdminPostgresClient, getBetterAuth, getOutboxWriter } from "../../server/clients.ts"
import { ensureSession } from "../sessions/session.functions.ts"

/**
 * Exported for input-schema tests.
 */
export const impersonateUserInputSchema = z.object({
  userId: z.string().min(1).max(256),
})

/**
 * Start impersonating another user.
 *
 * The flow:
 * 1. Guard: `requireAdminSession()` — rejects non-admins with
 *    `NotFoundError`, matching the three-guard discipline.
 * 2. Resolve the target's first organization membership via
 *    {@link AdminUserRepository}. This also verifies the target
 *    exists (Better Auth would otherwise create an impersonation
 *    session for a nonsense id). The first-org id is captured in the
 *    audit event as a best-effort hint of which tenant the admin was
 *    about to see.
 * 3. Write `AdminImpersonationStarted` to the outbox. Writing
 *    **before** the Better Auth swap means if the swap fails we still
 *    have a record that an attempt was made. The event's envelope
 *    `organizationId` is `"system"` — impersonation is platform-wide
 *    audit, not tenant-owned.
 * 4. Call Better Auth's `auth.api.impersonateUser`, which mints a new
 *    session cookie for the target user and stores the admin's id in
 *    `sessions.impersonatedBy`. The client redirects to `/` after
 *    this returns.
 */
export const impersonateUser = createServerFn({ method: "POST" })
  .inputValidator(impersonateUserInputSchema)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { userId: adminUserId } = await requireAdminSession()

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
 * NOTE: this handler deliberately does NOT call `requireAdminSession()`.
 * During impersonation the current session user is the *target* (role
 * = `"user"`), so an admin-role check would reject the very call that
 * needs to succeed. The guard is instead "is `session.impersonatedBy`
 * set?" — which is only true inside an active impersonation.
 *
 * The admin's id is recovered from `session.impersonatedBy` *before*
 * calling Better Auth's `stopImpersonating` (which swaps the cookie
 * back and clears the field). The audit event is written before the
 * swap for the same "record the attempt even if the swap fails"
 * reason as on start.
 */
export const stopImpersonating = createServerFn({ method: "POST" }).handler(async (): Promise<{ ok: true }> => {
  const session = await ensureSession()
  const adminUserId = (session.session as { impersonatedBy?: string | null }).impersonatedBy ?? null
  if (!adminUserId) {
    // Match the backoffice 404 discipline — never fingerprint admin
    // surfaces with 401/403 shapes.
    throw new NotFoundError({ entity: "Route", id: "backoffice" })
  }

  const targetUserId = session.user.id

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
