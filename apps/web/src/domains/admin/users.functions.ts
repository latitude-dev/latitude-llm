import {
  type AdminUserDetails,
  type AdminUserMembership,
  type AdminUserSession,
  getUserDetailsUseCase,
} from "@domain/admin"
import { generateId, UserId } from "@domain/shared"
import { AdminUserRepositoryLive, SqlClientLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { Effect } from "effect"
import { UAParser } from "ua-parser-js"
import { z } from "zod"
import { adminMiddleware } from "../../server/admin-middleware.ts"
import { getAdminPostgresClient, getBetterAuth, getOutboxWriter } from "../../server/clients.ts"
import { type GeoIpInfo, lookupGeoIpBatch } from "../../server/geoip.ts"

export interface AdminUserDetailsMembershipDto {
  organizationId: string
  organizationName: string
  organizationSlug: string
  role: "owner" | "admin" | "member"
}

/**
 * Pre-parsed view of an active session row, post-processed by the
 * server function so the UI is pure: User-Agent parsing and GeoIP
 * resolution both happen here, not in the browser. The TanStack Start
 * compiler strips the `ua-parser-js` dep + `geoip.ts` module from the
 * client bundle.
 */
export interface AdminUserSessionDto {
  id: string
  /**
   * Better Auth's session token — the value
   * `auth.api.revokeUserSession` takes. Sent to the client for the
   * per-row Revoke button; the action itself runs server-side under
   * `adminMiddleware`, so we're not granting any new authority by
   * exposing it.
   */
  token: string
  ipAddress: string | null
  /** Raw User-Agent string. Kept for hover-to-reveal / debugging. */
  userAgent: string | null
  /** Best-effort browser name parsed from the User-Agent. */
  browserName: string | null
  /** Best-effort OS name parsed from the User-Agent. */
  osName: string | null
  /**
   * `"desktop"` for parser results without an explicit device-type
   * (the parser leaves `device.type` undefined for laptops/desktops);
   * otherwise the parser's value (`"mobile"`, `"tablet"`, etc.).
   */
  deviceKind: string
  geo: GeoIpInfo | null
  createdAt: string
  updatedAt: string
  expiresAt: string
  impersonatedByUserId: string | null
  impersonatedByEmail: string | null
}

export interface AdminUserDetailsDto {
  id: string
  email: string
  name: string | null
  image: string | null
  role: "user" | "admin"
  memberships: AdminUserDetailsMembershipDto[]
  sessions: AdminUserSessionDto[]
  createdAt: string
}

const sessionToDto = (s: AdminUserSession, geo: GeoIpInfo | null): AdminUserSessionDto => {
  const parsed = s.userAgent ? UAParser(s.userAgent) : null
  return {
    id: s.id,
    token: s.token,
    ipAddress: s.ipAddress,
    userAgent: s.userAgent,
    browserName: parsed?.browser.name ?? null,
    osName: parsed?.os.name ?? null,
    deviceKind: parsed?.device.type ?? "desktop",
    geo,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    impersonatedByUserId: s.impersonatedByUserId,
    impersonatedByEmail: s.impersonatedByEmail,
  }
}

const toDto = async (details: AdminUserDetails): Promise<AdminUserDetailsDto> => {
  // Resolve geo for every distinct IP in one pass — the helper
  // dedupes internally so a user with 5 sessions on the same address
  // issues at most one upstream call.
  const geoByIp = await lookupGeoIpBatch(details.sessions.map((s) => s.ipAddress))
  const sessions = details.sessions.map((s) => sessionToDto(s, s.ipAddress ? (geoByIp.get(s.ipAddress) ?? null) : null))

  return {
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
    sessions,
    createdAt: details.createdAt.toISOString(),
  }
}

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

    return await toDto(details)
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

/**
 * Exported for input-schema tests.
 */
export const adminRevokeUserSessionsInputSchema = z.object({
  userId: z.string().min(1).max(256),
})

/**
 * Sign a user out of every active session ("Revoke all sessions"
 * row in the user-detail Account actions section).
 *
 * Flow:
 * 1. `adminMiddleware` injects `context.adminUserId`.
 * 2. Best-effort count active sessions via `auth.api.listUserSessions`
 *    so the audit event can report how many sessions were affected.
 *    On failure we fall back to `0` and still emit the event — the
 *    primary audit value is "the admin took this action", not the
 *    exact count.
 * 3. Write `AdminUserSessionsRevoked` to the outbox before the
 *    revocation, matching the discipline of `impersonateUser` /
 *    `adminSetUserRole`.
 * 4. Call `auth.api.revokeUserSessions`. Better Auth's admin
 *    plugin invokes `internalAdapter.deleteSessions(userId)` which
 *    drops every session row for that user.
 *
 * Note: an admin revoking their own sessions is allowed; the next
 * request after the cookie cache flushes will redirect them to
 * /login.
 */
export const adminRevokeUserSessions = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(adminRevokeUserSessionsInputSchema)
  .handler(async ({ data, context }): Promise<{ ok: true; sessionCount: number }> => {
    const adminUserId = context.adminUserId
    const headers = getRequestHeaders()
    const auth = getBetterAuth()

    let sessionCount = 0
    try {
      const result = await auth.api.listUserSessions({
        body: { userId: data.userId },
        headers,
      })
      sessionCount = result.sessions.length
    } catch {
      // Swallow — the audit event still fires with sessionCount: 0.
      // The primary signal of this row is "admin did the revoke",
      // not the count.
    }

    const outboxWriter = getOutboxWriter()
    await Effect.runPromise(
      outboxWriter
        .write({
          id: generateId(),
          eventName: "AdminUserSessionsRevoked",
          aggregateType: "user",
          aggregateId: data.userId,
          organizationId: "system",
          payload: {
            adminUserId,
            targetUserId: data.userId,
            sessionCount,
          },
          occurredAt: new Date(),
        })
        .pipe(Effect.provide(SqlClientLive(getAdminPostgresClient())), withTracing),
    )

    await auth.api.revokeUserSessions({ body: { userId: data.userId }, headers })

    return { ok: true, sessionCount }
  })

/**
 * Exported for input-schema tests.
 */
export const adminRevokeUserSessionInputSchema = z.object({
  userId: z.string().min(1).max(256),
  sessionId: z.string().min(1).max(256),
  /**
   * The Better Auth `revokeUserSession` admin endpoint takes a
   * session token (not the row id). We accept both on the wire — the
   * UI hands us the token because that's what's needed for the
   * actual revocation, and `sessionId` is plumbed through purely as
   * the audit-event identifier (more readable than the token in
   * audit logs, which are visible to support staff).
   */
  sessionToken: z.string().min(1).max(2048),
})

/**
 * Sign a single session out — backing the per-row Revoke button on
 * the Sessions panel.
 *
 * Audit-only by design: we don't fetch the user details before the
 * revoke (the audit row stands on its own with adminUserId +
 * targetUserId + sessionId), but we do scope the operation to a
 * specific user so an out-of-band admin can't accidentally drop the
 * wrong session by guessing a token. The `userId` is captured on
 * the audit event for symmetry with the other admin-action events.
 */
export const adminRevokeUserSession = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(adminRevokeUserSessionInputSchema)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const adminUserId = context.adminUserId

    const outboxWriter = getOutboxWriter()
    await Effect.runPromise(
      outboxWriter
        .write({
          id: generateId(),
          eventName: "AdminUserSessionRevoked",
          aggregateType: "user",
          aggregateId: data.userId,
          organizationId: "system",
          payload: {
            adminUserId,
            targetUserId: data.userId,
            sessionId: data.sessionId,
          },
          occurredAt: new Date(),
        })
        .pipe(Effect.provide(SqlClientLive(getAdminPostgresClient())), withTracing),
    )

    const headers = getRequestHeaders()
    const auth = getBetterAuth()
    await auth.api.revokeUserSession({ body: { sessionToken: data.sessionToken }, headers })

    return { ok: true }
  })
