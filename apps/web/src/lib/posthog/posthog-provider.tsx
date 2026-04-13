import { useMountEffect } from "@repo/ui"
import { identifyOrganization, identifyUser, initPostHog, resetPostHog } from "./posthog-client.ts"

/**
 * Initializes posthog-js on mount. SSR-safe: `initPostHog` no-ops on the
 * server and when VITE_LAT_POSTHOG_KEY is not configured. Rendered at the root
 * so unauthenticated pages (landing, login, signup) also participate in
 * session recording and autocapture.
 */
export function PostHogProvider() {
  useMountEffect(() => {
    void initPostHog()
  })
  return null
}

interface PostHogIdentityProps {
  readonly userId: string
  readonly userEmail: string
  readonly userName?: string | null | undefined
  readonly organizationId: string
  readonly organizationName?: string | null | undefined
}

/**
 * Identifies the current user + org to PostHog exactly once per mount.
 *
 * The parent MUST key this component by userId (e.g. `<PostHogIdentity key={user.id} ... />`)
 * so that when the logged-in user changes, the component remounts and the
 * reset→identify sequence runs again. This pattern covers all the ways a
 * session can end (explicit logout, session expiry, admin revocation, deleteCurrentUser)
 * because the route tree rerenders with a new user.id.
 */
export function PostHogIdentity({
  userId,
  userEmail,
  userName,
  organizationId,
  organizationName,
}: PostHogIdentityProps) {
  useMountEffect(() => {
    void (async () => {
      // Reset first so the previous identity on the same device doesn't bleed
      // through (e.g. a second user logging in from the same browser).
      await resetPostHog()
      await identifyUser({
        id: userId,
        email: userEmail,
        ...(userName != null ? { name: userName } : {}),
      })
      await identifyOrganization({
        id: organizationId,
        ...(organizationName != null ? { name: organizationName } : {}),
      })
    })()
  })
  return null
}
