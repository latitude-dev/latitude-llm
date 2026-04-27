import { type AdminUserDetails, type AdminUserMembership, getUserDetailsUseCase } from "@domain/admin"
import { generateId, UserId } from "@domain/shared"
import { AdminUserRepositoryLive, SqlClientLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { Effect } from "effect"
import { z } from "zod"
import { adminMiddleware } from "../../server/admin-middleware.ts"
import { getAdminPostgresClient, getBetterAuth, getOutboxWriter } from "../../server/clients.ts"

export interface AdminUserDetailsMembershipDto {
  organizationId: string
  organizationName: string
  organizationSlug: string
  role: "owner" | "admin" | "member"
}

export interface AdminUserDetailsDto {
  id: string
  email: string
  name: string | null
  image: string | null
  role: "user" | "admin"
  memberships: AdminUserDetailsMembershipDto[]
  createdAt: string
}

const toDto = (details: AdminUserDetails): AdminUserDetailsDto => ({
  id: details.id,
  email: details.email,
  name: details.name,
  image: details.image,
  role: details.role,
  memberships: details.memberships.map(
    (m: AdminUserMembership): AdminUserDetailsMembershipDto => ({
      organizationId: m.organizationId,
      organizationName: m.organizationName,
      organizationSlug: m.organizationSlug,
      role: m.role,
    }),
  ),
  createdAt: details.createdAt.toISOString(),
})

/**
 * Exported so tests can exercise input validation without spinning up the
 * server-function RPC runtime. The admin guard itself is covered by unit
 * tests in `admin-auth.test.ts`.
 */
export const adminGetUserInputSchema = z.object({
  userId: z.string().min(1).max(256),
})

/**
 * Backoffice user-detail fetch.
 *
 * Guard: {@link adminMiddleware} runs before the input validator and
 * rejects non-admins with `NotFoundError` (identical to hitting a
 * non-existent server function). Queries use
 * {@link getAdminPostgresClient} + `withPostgres` at the default
 * `OrganizationId("system")` scope — the only sanctioned RLS-bypass
 * signal.
 */
export const adminGetUser = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator(adminGetUserInputSchema)
  .handler(async ({ data }): Promise<AdminUserDetailsDto> => {
    const client = getAdminPostgresClient()

    const details = await Effect.runPromise(
      getUserDetailsUseCase({ userId: UserId(data.userId) }).pipe(
        withPostgres(AdminUserRepositoryLive, client),
        withTracing,
      ),
    )

    return toDto(details)
  })

/**
 * Exported for input-schema tests.
 */
export const adminSetUserRoleInputSchema = z.object({
  userId: z.string().min(1).max(256),
  role: z.enum(["user", "admin"]),
})

/**
 * Promote / demote a user's global `users.role`. Used by the
 * "Promote to staff" / "Demote from staff" rows in the user-detail
 * Account actions section.
 *
 * Flow:
 * 1. `adminMiddleware` guard injects `context.adminUserId`.
 * 2. Read the target's current role (we need `fromRole` for the audit
 *    event, and `auth.api.setRole` doesn't return it explicitly).
 * 3. No-op when `fromRole === toRole` — avoid emitting a misleading
 *    audit event for a click that didn't actually change anything.
 * 4. Write `AdminUserRoleChanged` to the outbox before the swap, so
 *    if the Better Auth call fails we still have a record of the
 *    attempt (same discipline as `impersonateUser`).
 * 5. Call `auth.api.setRole`, which updates the column.
 *
 * Self-demotion is intentionally allowed — see the plan / PR
 * discussion. An admin can demote themselves; the next request after
 * the cookie cache flushes will reject them from `/backoffice` like
 * any other non-admin.
 */
export const adminSetUserRole = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(adminSetUserRoleInputSchema)
  .handler(async ({ data, context }): Promise<{ ok: true; fromRole: "user" | "admin"; toRole: "user" | "admin" }> => {
    const adminUserId = context.adminUserId

    const target = await Effect.runPromise(
      getUserDetailsUseCase({ userId: UserId(data.userId) }).pipe(
        withPostgres(AdminUserRepositoryLive, getAdminPostgresClient()),
        withTracing,
      ),
    )

    const fromRole = target.role
    const toRole = data.role

    if (fromRole === toRole) {
      return { ok: true, fromRole, toRole }
    }

    const outboxWriter = getOutboxWriter()
    await Effect.runPromise(
      outboxWriter
        .write({
          id: generateId(),
          eventName: "AdminUserRoleChanged",
          aggregateType: "user",
          aggregateId: target.id,
          organizationId: "system",
          payload: {
            adminUserId,
            targetUserId: target.id,
            fromRole,
            toRole,
          },
          occurredAt: new Date(),
        })
        .pipe(Effect.provide(SqlClientLive(getAdminPostgresClient())), withTracing),
    )

    const headers = getRequestHeaders()
    const auth = getBetterAuth()
    await auth.api.setRole({ body: { userId: target.id, role: toRole }, headers })

    return { ok: true, fromRole, toRole }
  })

/**
 * Exported for input-schema tests.
 *
 * The email regex Zod ships with rejects the obvious garbage (no `@`,
 * trailing whitespace, control characters), which is the only thing we
 * actually need at the validator boundary — Better Auth's internal
 * adapter handles uniqueness, and any hidden-character abuse stops at
 * the `.trim()`.
 */
export const adminChangeUserEmailInputSchema = z.object({
  userId: z.string().min(1).max(256),
  newEmail: z.string().trim().toLowerCase().email().max(320),
})

/**
 * Update a user's primary login email.
 *
 * The "Change email" row in the user-detail Account actions section
 * exists for the most common support ticket: a user typo'd their
 * email at sign-up, can't sign in, and needs us to repoint their
 * account at the right address.
 *
 * Flow:
 * 1. `adminMiddleware` injects `context.adminUserId`.
 * 2. Read the target's current email so the audit event can capture
 *    the "from → to" transition explicitly. The users row mutates,
 *    so the historical snapshot has to live on the event.
 * 3. No-op when the new email already matches — keeps the audit
 *    trail honest by not emitting an event for a click that didn't
 *    change anything.
 * 4. Write `AdminUserEmailChanged` to the outbox before the swap so
 *    if the Better Auth call fails we still have a record of the
 *    attempt (same discipline as `impersonateUser` and
 *    `adminSetUserRole`).
 * 5. Call `auth.api.adminUpdateUser` with `{ email }`. Better Auth's
 *    admin plugin writes through the internal adapter, which means
 *    we deliberately do NOT trigger the email-change verification
 *    flow — admins are the source of truth here, and forcing the
 *    user to re-verify a corrected typo defeats the point of the
 *    action. `emailVerified` is left untouched on purpose.
 *
 * Active sessions on the old email keep working until they expire;
 * in-flight magic links keep working until their TTL elapses. This
 * is surfaced in the modal copy.
 */
export const adminChangeUserEmail = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(adminChangeUserEmailInputSchema)
  .handler(async ({ data, context }): Promise<{ ok: true; fromEmail: string; toEmail: string }> => {
    const adminUserId = context.adminUserId

    const target = await Effect.runPromise(
      getUserDetailsUseCase({ userId: UserId(data.userId) }).pipe(
        withPostgres(AdminUserRepositoryLive, getAdminPostgresClient()),
        withTracing,
      ),
    )

    const fromEmail = target.email
    const toEmail = data.newEmail

    if (fromEmail === toEmail) {
      return { ok: true, fromEmail, toEmail }
    }

    const outboxWriter = getOutboxWriter()
    await Effect.runPromise(
      outboxWriter
        .write({
          id: generateId(),
          eventName: "AdminUserEmailChanged",
          aggregateType: "user",
          aggregateId: target.id,
          organizationId: "system",
          payload: {
            adminUserId,
            targetUserId: target.id,
            fromEmail,
            toEmail,
          },
          occurredAt: new Date(),
        })
        .pipe(Effect.provide(SqlClientLive(getAdminPostgresClient())), withTracing),
    )

    const headers = getRequestHeaders()
    const auth = getBetterAuth()
    await auth.api.adminUpdateUser({
      body: { userId: target.id, data: { email: toEmail } },
      headers,
    })

    return { ok: true, fromEmail, toEmail }
  })
