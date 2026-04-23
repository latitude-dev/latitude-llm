import { NotFoundError, UserId } from "@domain/shared"
import type { User } from "@platform/db-postgres"
import { ensureSession } from "../domains/sessions/session.functions.ts"

/**
 * Better Auth's base `User` type does not include the app-extended
 * `users.role` column. The column is surfaced at runtime via
 * `user.additionalFields` in the Better Auth config, but TypeScript can't
 * see it through the exported `User` type — so we narrow locally.
 *
 * When the Better Auth admin plugin is installed (PR 2) it will declare
 * `role` in its schema and this workaround can be removed.
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
 * Admin gate for backoffice server functions.
 *
 * MUST be the first line of every admin `createServerFn` handler. Server
 * functions are exposed at stable RPC URLs that any authenticated user can
 * hit directly, so the route-level guard is not sufficient on its own.
 */
export const requireAdminSession = async (): Promise<AdminSession> => {
  const session = await ensureSession()
  const user = session.user as User & { role?: string | null }
  assertAdminUser(user)
  return { userId: UserId(user.id), user }
}
