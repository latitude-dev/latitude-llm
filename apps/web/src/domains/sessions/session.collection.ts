import { useQuery } from "@tanstack/react-query"
import { getSession } from "./session.functions.ts"

/**
 * The current auth session (user + Better Auth session), read via the
 * `getSession` server fn through TanStack Query so it works in ANY route tree —
 * unlike `useAuthenticatedUser` & co. (`routes/_authenticated/-route-data.ts`),
 * which read the `_authenticated` layout's loader data and throw outside it
 * (e.g. in the sandbox tree, which hangs off the root route).
 *
 * `staleTime: Infinity` — the session rarely changes within a tab's lifetime and
 * a single cached fetch (keyed `["auth-session"]`) is shared by every consumer.
 *
 * `role` / `impersonatedBy` aren't in the client's typed session (the client has
 * no `adminClient` plugin), so they're read loosely off the returned payload.
 */
export function useAuthSession() {
  const query = useQuery({
    queryKey: ["auth-session"],
    queryFn: () => getSession(),
    staleTime: Number.POSITIVE_INFINITY,
  })
  const data = query.data
  const user = data?.user
  const isAdmin = (user as { role?: string } | undefined)?.role === "admin"
  const isImpersonating =
    typeof (data?.session as { impersonatedBy?: unknown } | undefined)?.impersonatedBy === "string"

  return { ...query, user, isAdmin, isImpersonating }
}
