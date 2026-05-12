import { ForbiddenError, type UserId } from "@domain/shared"
import type { Context } from "hono"

/**
 * Asserts that the current request was authenticated through the OAuth flow
 * (`Bearer loa_*` token), not through an organization-scoped API key. Returns
 * the authenticated user id so the route can pass it to use-cases that need a
 * real actor (`updateMemberRoleUseCase`, `removeMemberUseCase`, `inviteMember`,
 * `transferOwnership` — anything that does admin-permission checks or audit
 * attribution).
 *
 * Throws `ForbiddenError` (→ 403) for API-key callers. API keys are
 * organization-scoped admin credentials, not user-scoped, so they intentionally
 * can't drive endpoints whose semantics require "who specifically is doing
 * this." Surface a clear 403 instead of forcing the use-case to fail with a
 * less informative permission error.
 */
export const requireOAuthUserId = (c: Context): UserId => {
  const auth = c.var.auth
  if (auth?.method !== "oauth") {
    throw new ForbiddenError({
      message: "This endpoint requires OAuth authentication; API-key callers can't act on behalf of a specific user.",
    })
  }
  return auth.userId
}
