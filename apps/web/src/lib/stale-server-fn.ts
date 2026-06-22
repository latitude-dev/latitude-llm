/**
 * A stale browser tab invokes a server-function hash from a previous build. The
 * new deploy's resolver (`getServerFnById`) no longer has that hash, so TanStack
 * Start throws "Server function info not found for <hash>". A hash from the
 * *current* build always resolves, so this is exclusively a client-staleness
 * condition — never a real fault in the running deploy. We treat it as expected
 * on the server (no Datadog exception) and self-heal on the client (reload into
 * the new build).
 */
// TanStack Start has no typed error or code for this: the generated server-fn
// resolver (`getServerFnById`) throws a bare `Error`, which the server handler
// serializes through seroval and the client rethrows with the message intact.
// So the message is the only discriminant we have, on both sides. We match the
// full `…not found for <id>` shape (not a loose substring) so an unrelated error
// can't trip it. Coupling to this string is deliberate — re-verify it on
// `@tanstack/react-start` upgrades (matched against start-server-core 1.167.x).
const STALE_SERVER_FN_MESSAGE_PATTERN = /Server function info not found for \S+/

export function isStaleServerFnError(error: unknown): boolean {
  return error instanceof Error && STALE_SERVER_FN_MESSAGE_PATTERN.test(error.message)
}

// Reload at most once per window: if a stale-driven reload just happened and the
// condition somehow persists (e.g. a CDN still serving stale HTML), don't spin.
export const STALE_SERVER_FN_RELOAD_GUARD_MS = 10_000
const RELOAD_GUARD_KEY = "latitude:stale-server-fn-reload-at"

interface MaybeReloadArgs {
  readonly error: unknown
  readonly reload: () => void
  readonly now: number
  readonly storage: Pick<Storage, "getItem" | "setItem"> | null
}

/**
 * Reloads the page when `error` is a stale-server-fn error, unless a reload
 * already happened within the guard window. Returns whether it reloaded.
 * `reload`/`now`/`storage` are injected so the decision is unit-testable.
 */
export function maybeReloadForStaleServerFn({ error, reload, now, storage }: MaybeReloadArgs): boolean {
  if (!isStaleServerFnError(error)) return false

  const lastReloadAt = Number(storage?.getItem(RELOAD_GUARD_KEY) ?? "")
  if (Number.isFinite(lastReloadAt) && lastReloadAt > 0 && now - lastReloadAt < STALE_SERVER_FN_RELOAD_GUARD_MS) {
    return false
  }

  storage?.setItem(RELOAD_GUARD_KEY, String(now))
  reload()
  return true
}
