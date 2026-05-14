/**
 * Server-fns backing the **Active sessions** section on
 * `/settings/account`. The user sees one row per device / browser they're
 * currently signed in on, plus a button to revoke any of them (except
 * the current one — that's the "sign out" button elsewhere) and a
 * "Sign out everywhere else" action that revokes all-but-this.
 *
 * Built on Better Auth's session APIs:
 * - `auth.api.listSessions({ headers })` — returns the caller's sessions
 *   (BA filters by `userId` from the bearer cookie).
 * - `auth.api.revokeSession({ body: { token }, headers })` — revokes one.
 * - `auth.api.revokeOtherSessions({ headers })` — keeps current, drops the rest.
 *
 * The list is parsed server-side (User-Agent → browser/OS/device, IP →
 * country/city) so the page stays a thin client: the TanStack Start
 * compiler strips `ua-parser-js` + `geoip.ts` from the client bundle the
 * same way it already does for the admin user-details page.
 */
import { UnauthorizedError } from "@domain/shared"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { UAParser } from "ua-parser-js"
import { z } from "zod"
import { getBetterAuth } from "../../server/clients.ts"
import { type GeoIpInfo, lookupGeoIpBatch } from "../../server/geoip.ts"

/**
 * Pre-parsed view of one active session, ready for the settings page.
 * Mirrors `AdminUserSessionDto` minus the impersonation fields — those
 * only matter on the admin view, not the user's own settings.
 */
export interface UserSessionDto {
  readonly id: string
  /** BA session token. Pass it to {@link revokeUserSession} to sign out this device. */
  readonly token: string
  readonly ipAddress: string | null
  readonly userAgent: string | null
  readonly browserName: string | null
  readonly osName: string | null
  /**
   * `"desktop"` when the parser leaves device type unset (laptops /
   * desktops), otherwise the parser's value (`"mobile"`, `"tablet"`, …).
   */
  readonly deviceKind: string
  readonly geo: GeoIpInfo | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly expiresAt: string
  /** `true` for the session the current request is authenticated against. */
  readonly current: boolean
}

interface BetterAuthSessionRow {
  readonly id: string
  readonly token: string
  readonly ipAddress?: string | null
  readonly userAgent?: string | null
  readonly createdAt: Date | string
  readonly updatedAt: Date | string
  readonly expiresAt: Date | string
}

const asIso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString()

const toDto = (row: BetterAuthSessionRow, geo: GeoIpInfo | null, current: boolean): UserSessionDto => {
  const parsed = row.userAgent ? UAParser(row.userAgent) : null
  return {
    id: row.id,
    token: row.token,
    ipAddress: row.ipAddress ?? null,
    userAgent: row.userAgent ?? null,
    browserName: parsed?.browser.name ?? null,
    osName: parsed?.os.name ?? null,
    deviceKind: parsed?.device.type ?? "desktop",
    geo,
    createdAt: asIso(row.createdAt),
    updatedAt: asIso(row.updatedAt),
    expiresAt: asIso(row.expiresAt),
    current,
  }
}

/**
 * Lists every active session for the signed-in user, newest first. The
 * current session is marked with `current: true` so the UI can disable
 * its revoke button and label it accordingly.
 */
export const listUserSessions = createServerFn({ method: "GET" }).handler(
  async (): Promise<readonly UserSessionDto[]> => {
    const headers = getRequestHeaders()
    const auth = getBetterAuth()

    const session = await auth.api.getSession({ headers })
    if (!session) throw new UnauthorizedError({ message: "Unauthorized" })

    const rows = (await auth.api.listSessions({ headers })) as ReadonlyArray<BetterAuthSessionRow>
    const currentToken = session.session.token

    const geoByIp = await lookupGeoIpBatch(rows.map((r) => r.ipAddress ?? null))

    return rows
      .map((row) => toDto(row, row.ipAddress ? (geoByIp.get(row.ipAddress) ?? null) : null, row.token === currentToken))
      .sort((a, b) => {
        // Current session pinned to the top; rest by most-recently-active.
        if (a.current !== b.current) return a.current ? -1 : 1
        return b.updatedAt.localeCompare(a.updatedAt)
      })
  },
)

/**
 * Revokes a single session by token. The current session is rejected
 * here so a stray click can't accidentally sign the user out from the
 * tab they're using — use `authClient.signOut()` for an explicit sign-out.
 */
export const revokeUserSession = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }): Promise<{ readonly success: true }> => {
    const headers = getRequestHeaders()
    const auth = getBetterAuth()

    const session = await auth.api.getSession({ headers })
    if (!session) throw new UnauthorizedError({ message: "Unauthorized" })
    if (session.session.token === data.token) {
      throw new UnauthorizedError({
        message: "To sign out the current device, use the Sign Out button instead of revoking it here.",
      })
    }

    await auth.api.revokeSession({ headers, body: { token: data.token } })
    return { success: true }
  })

/**
 * Revokes every session other than the current one. Used by the
 * "Sign out everywhere else" button on the settings page.
 */
export const revokeAllOtherUserSessions = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ readonly success: true }> => {
    const headers = getRequestHeaders()
    const auth = getBetterAuth()

    const session = await auth.api.getSession({ headers })
    if (!session) throw new UnauthorizedError({ message: "Unauthorized" })

    await auth.api.revokeOtherSessions({ headers })
    return { success: true }
  },
)
