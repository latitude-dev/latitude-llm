import { NotFoundError, UserId } from "@domain/shared"
import type { User } from "@platform/db-postgres"
import { getFreshSession } from "../domains/sessions/session.functions.ts"

/**
 * Better Auth's base `User` type does not include the app-extended
 * `users.role` column. The column is surfaced at runtime by the Better
 * Auth `admin` plugin, but TypeScript can't see it through the exported
 * `User` type — so we narrow locally.
 */
type UserWithRole = User & { readonly role: "user" | "admin" }

interface AdminSession {
  readonly userId: UserId
  readonly user: UserWithRole
}

/**
 * Throws {@link NotFoundError} if the given user is not a platform admin.
 *
 * 404 (not 401/403) is deliberate: the existence of the backoffice surface
 * must not leak through error types. Non-admins probing an admin endpoint
 * must see the same response as they would for any non-existent route.
 */
export function assertAdminUser(
  user: (User & { role?: string | null }) | null | undefined,
): asserts user is UserWithRole {
  if (!user || user.role !== "admin") {
    throw new NotFoundError({ entity: "Route", id: "backoffice" })
  }
}

/**
 * Admin gate for backoffice server functions and the backoffice route
 * loader. MUST be the first IO of every admin-gated handler — TanStack
 * Start exposes server functions at stable RPC URLs that any
 * authenticated user can hit directly, so the route-level guard is not
 * sufficient on its own.
 *
 * Uses {@link getFreshSession}, which asks Better Auth to skip the
 * 5-minute session cookie cache (`session.cookieCache` in
 * `create-better-auth.ts`) and re-read the session user from the DB.
 * Without this, a role demotion (e.g. `UPDATE users SET role='user'`)
 * stays invisible to admin guards for up to 5 minutes — long enough to
 * matter if a staff credential is ever compromised.
 *
 * This file is intentionally free of `@repo/observability` /
 * `@platform/db-postgres` imports: it gets pulled into the backoffice
 * route's client graph, and direct imports there would leak Node-only
 * symbols (`withTracing`, etc.) into the browser bundle. All Node-only
 * work lives behind the `getFreshSession` server function, which the
 * TanStack Start compiler strips on the client.
 */
export const requireAdminSession = async (): Promise<AdminSession> => {
  const session = await getFreshSession()
  const user = session?.user as (User & { role?: string | null }) | undefined
  assertAdminUser(user)
  return { userId: UserId(user.id), user }
}
