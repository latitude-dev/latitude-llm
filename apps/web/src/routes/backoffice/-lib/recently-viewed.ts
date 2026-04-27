import { useEffect, useMemo, useState } from "react"

/**
 * Recently-viewed backoffice navigation history.
 *
 * Stored in `localStorage` under {@link STORAGE_KEY}. Used to render the
 * "Recently viewed" strip under the omnibox and the per-row "Viewed Xh
 * ago" indicator on search results.
 *
 * Design choices worth knowing:
 *
 * - **Storage, not server-side.** The list is per-browser, per-device.
 *   Staff who switch laptops start fresh. Server-side history would
 *   need a new table + auth + cleanup; the value isn't worth it for a
 *   nav-aid feature.
 * - **Cap + dedupe.** The most-recent {@link MAX_RECENT_ENTRIES}
 *   entries are kept; older ones rotate out. Revisiting an entry moves
 *   it to the top instead of duplicating it.
 * - **Cached display data.** Each entry stores `primary` and
 *   `secondary` text (e.g. user email, org name) so the recent-strip
 *   chips can render without re-fetching anything. The cached labels
 *   may go slightly stale if an entity is renamed; the next visit to
 *   that entity's detail page refreshes the cache via
 *   {@link recordRecentView}. Live data on the detail page itself is
 *   always fresh — only the chip caption can be stale.
 * - **Cross-tab sync.** Updates dispatch a `storage` event (browser
 *   default) and an in-tab `CustomEvent` so the omnibox in tab A
 *   reacts the moment a detail page is opened in tab B (or in the
 *   same tab via SPA navigation).
 * - **SSR-safe.** Every function short-circuits when `window` is
 *   undefined and returns the empty list. Hooks render an empty
 *   placeholder during SSR and hydrate on mount; layout uses fixed
 *   heights so there is no flicker.
 *
 * The storage layer is intentionally hand-rolled (no external state
 * manager). It's a single key with a small JSON array.
 */

export const STORAGE_KEY = "backoffice:recently-viewed"
export const CHANGE_EVENT = "backoffice:recently-viewed-changed"
export const MAX_RECENT_ENTRIES = 20

export type RecentBackofficeKind = "user" | "organization" | "project"

export interface RecentBackofficeView {
  readonly kind: RecentBackofficeKind
  readonly id: string
  /** What to render as the chip's primary text — email / org name / project name. */
  readonly primary: string
  /** Optional supporting text — slug, secondary identifier. Renders muted under `primary` on chips. */
  readonly secondary?: string
  /** ms epoch, set by {@link recordRecentView}. */
  readonly viewedAt: number
}

const isRecentBackofficeKind = (value: unknown): value is RecentBackofficeKind =>
  value === "user" || value === "organization" || value === "project"

const isRecentBackofficeView = (value: unknown): value is RecentBackofficeView => {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return (
    isRecentBackofficeKind(v.kind) &&
    typeof v.id === "string" &&
    v.id.length > 0 &&
    typeof v.primary === "string" &&
    (v.secondary === undefined || typeof v.secondary === "string") &&
    typeof v.viewedAt === "number" &&
    Number.isFinite(v.viewedAt)
  )
}

const isBrowser = (): boolean => typeof window !== "undefined" && typeof window.localStorage !== "undefined"

/**
 * Read the recently-viewed list from `localStorage`, sorted newest
 * first. Returns an empty list on SSR, on missing key, or on any
 * parse / validation failure (corrupted entry from an older schema is
 * silently dropped — we'd rather lose the cache than crash the page).
 */
export function loadRecentViews(): readonly RecentBackofficeView[] {
  if (!isBrowser()) return []
  let raw: string | null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    // localStorage can throw on private-mode quota / disabled storage.
    return []
  }
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  // Filter out entries that fail validation rather than failing the
  // whole list. One bad entry from a schema migration shouldn't blank
  // the user's whole history.
  const valid = parsed.filter(isRecentBackofficeView)
  return [...valid].sort((a, b) => b.viewedAt - a.viewedAt)
}

/**
 * Record a visit. Moves the entry to the top if it already exists
 * (de-duped on `(kind, id)`), pushes new entries on, and trims to
 * {@link MAX_RECENT_ENTRIES}.
 *
 * Refreshes the cached `primary` / `secondary` text — calling this
 * from a detail page's loader is the natural way to keep chip
 * captions in sync with the live entity name.
 *
 * No-ops on the server.
 */
export function recordRecentView(input: Omit<RecentBackofficeView, "viewedAt">): void {
  if (!isBrowser()) return
  const current = loadRecentViews()
  const next: RecentBackofficeView[] = [
    { ...input, viewedAt: Date.now() },
    ...current.filter((v) => !(v.kind === input.kind && v.id === input.id)),
  ].slice(0, MAX_RECENT_ENTRIES)

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Quota exceeded / storage disabled. Drop silently — recent-views
    // is a UX nicety, not a feature whose loss merits an error.
    return
  }
  // Notify same-tab listeners. The browser-built-in `storage` event
  // only fires in OTHER tabs, so we dispatch a custom event for the
  // current tab.
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

/**
 * Clear the recently-viewed list. Exposed primarily for tests and a
 * future "Clear history" affordance.
 */
export function clearRecentViews(): void {
  if (!isBrowser()) return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    return
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

/**
 * React hook returning the live recently-viewed list. Subscribes to
 * `storage` events (other tabs) and the in-tab change event
 * ({@link CHANGE_EVENT}) so the strip stays in sync without prop
 * drilling.
 *
 * Returns the empty list during SSR — the consumer should render a
 * stable placeholder layout to avoid hydration mismatch (use a fixed
 * height on the chip strip's container).
 */
export function useRecentBackofficeViews(): readonly RecentBackofficeView[] {
  const [views, setViews] = useState<readonly RecentBackofficeView[]>([])

  useEffect(() => {
    setViews(loadRecentViews())

    const refresh = () => setViews(loadRecentViews())
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) refresh()
    }
    window.addEventListener("storage", onStorage)
    window.addEventListener(CHANGE_EVENT, refresh as EventListener)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener(CHANGE_EVENT, refresh as EventListener)
    }
  }, [])

  return views
}

/**
 * Records a visit to a backoffice entity on mount. Call this from
 * detail-page components / loaders so the entity reliably ends up in
 * the recent list whenever staff land on it.
 */
export function useTrackRecentBackofficeView(input: Omit<RecentBackofficeView, "viewedAt"> | null): void {
  const { kind, id, primary, secondary } = input ?? { kind: null, id: null, primary: null, secondary: undefined }
  useEffect(() => {
    if (!kind || !id || primary == null) return
    // `secondary` is optional under `exactOptionalPropertyTypes`, so we
    // include the key only when it has a value (omitting > undefined).
    recordRecentView(secondary !== undefined ? { kind, id, primary, secondary } : { kind, id, primary })
  }, [kind, id, primary, secondary])
}

/**
 * Look up the timestamp at which a given entity was last viewed,
 * `null` if never. Drives the per-row "viewed Xh ago" indicator.
 */
export function useRecentlyViewedAt(kind: RecentBackofficeKind, id: string): Date | null {
  const views = useRecentBackofficeViews()
  return useMemo(() => {
    const found = views.find((v) => v.kind === kind && v.id === id)
    return found ? new Date(found.viewedAt) : null
  }, [views, kind, id])
}
