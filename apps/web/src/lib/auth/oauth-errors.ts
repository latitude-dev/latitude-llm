/**
 * User-facing messages for OAuth callback failures.
 *
 * When a social sign-in fails at the Better Auth callback, BA redirects to
 * our `errorCallbackURL` (`/login`, see `oauth-redirects.ts`) with the error
 * code appended as `?error=<code>`. This maps the known codes to friendly
 * copy. Unknown codes get a generic message — the raw query value is never
 * echoed into the UI, so crafted links can't inject arbitrary text.
 */

const SIGN_IN_EXPIRED_MESSAGE = "That sign-in attempt expired or was interrupted. Please try again."

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  account_not_linked:
    "This email already has an account that isn't linked to that provider. Sign in with your email below, then link the provider under Settings → Account.",
  access_denied: "Sign-in was cancelled before it completed. Please try again.",
  please_restart_the_process: SIGN_IN_EXPIRED_MESSAGE,
  state_mismatch: SIGN_IN_EXPIRED_MESSAGE,
  state_not_found: SIGN_IN_EXPIRED_MESSAGE,
  signup_disabled: "New sign-ups are currently disabled for this provider. Continue with email below instead.",
  email_not_verified: "Your email address is not verified with that provider. Verify it there and try again.",
}

const GENERIC_OAUTH_ERROR_MESSAGE = "Could not complete the sign-in. Please try again or continue with email below."

/**
 * Resolve the `?error=` code from an OAuth callback redirect to a
 * user-facing message, or `undefined` when there is no error.
 */
export function oauthCallbackErrorMessage(code: string | undefined): string | undefined {
  if (!code) return undefined
  return OAUTH_ERROR_MESSAGES[code] ?? GENERIC_OAUTH_ERROR_MESSAGE
}

/**
 * Same idea for the account-LINKING flow (`linkSocial` from settings):
 * the codes BA's `/callback/:id` emits when `state.link` is set.
 */
const LINK_ERROR_MESSAGES: Record<string, string> = {
  "email_doesn't_match":
    "That account uses a different email than your Latitude account. Pick the account that matches your Latitude email.",
  account_already_linked_to_different_user: "That account is already connected to a different Latitude user.",
  access_denied: "Connecting was cancelled before it completed.",
}

const GENERIC_LINK_ERROR_MESSAGE = "Could not connect the account. Please try again."

/** Resolve a linking-callback `?error=` code to a user-facing message. */
export function oauthLinkErrorMessage(code: string): string {
  return LINK_ERROR_MESSAGES[code] ?? GENERIC_LINK_ERROR_MESSAGE
}
