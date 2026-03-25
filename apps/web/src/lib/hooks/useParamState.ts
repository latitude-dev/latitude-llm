import { type SetStateAction, useSyncExternalStore } from "react"

/**
 * useParamState — a useState-like hook backed by URL search parameters.
 *
 * Use this for ephemeral UI state that should be reflected in the URL (active
 * tab, open panels, sort columns, selected row IDs, etc.). Do NOT use
 * router.navigate for this — navigate is for actual page transitions (e.g.
 * opening a dataset after creation). useParamState bypasses the router
 * entirely, so it avoids TanStack Router's reconciliation overhead.
 *
 * Design decisions:
 *
 * - Uses `useSyncExternalStore` to treat the URL as an external store. This
 *   is the React-blessed way to subscribe to non-React state; it handles
 *   concurrent mode, avoids tearing, and provides an SSR snapshot.
 *
 * - The URL is the source of truth. Reads always parse `window.location.search`
 *   so there's no stale-closure risk and no local state to sync.
 *
 * - When the resolved value equals `defaultValue`, the param is removed from
 *   the URL entirely (via `Object.is` comparison), keeping URLs clean.
 *
 * - Writes are batched: multiple setters called in the same synchronous handler
 *   (e.g. `setSortBy(x); setSortDirection(y)`) produce only one React render.
 *   Each write updates `history` immediately so subsequent reads within the
 *   same tick see the latest URL, but the subscriber notification is deferred
 *   to a microtask so React processes all changes in a single pass.
 */

type ParamStateValue = boolean | number | string

/**
 * Widens literal types to their base type so the setter accepts any value of
 * that base type, not just the exact literal passed as `defaultValue`.
 * e.g. `useParamState("tab", "traces")` returns `[string, setter]` not
 * `["traces", setter]`.
 */
type WidenLiteral<T> = T extends string ? string : T extends number ? number : T extends boolean ? boolean : T

const PARAM_STATE_CHANGE_EVENT = "param-state-change"

/**
 * Shared subscription function for `useSyncExternalStore`. Listens to:
 * - `popstate`: browser back/forward navigation
 * - `param-state-change`: our custom event dispatched after writes
 *
 * Because this function is referentially stable (module-level), every
 * `useParamState` instance shares the same two listeners rather than
 * each hook adding its own pair.
 */
function subscribe(onStoreChange: () => void) {
  window.addEventListener("popstate", onStoreChange)
  window.addEventListener(PARAM_STATE_CHANGE_EVENT, onStoreChange)
  return () => {
    window.removeEventListener("popstate", onStoreChange)
    window.removeEventListener(PARAM_STATE_CHANGE_EVENT, onStoreChange)
  }
}

/**
 * Coerces a raw URL string value back to the type implied by `defaultValue`.
 * Uses the defaultValue's runtime type to decide the parsing strategy:
 * - boolean: accepts only `"true"` / `"false"`, falls back to defaultValue otherwise
 * - number: `Number()` with NaN fallback to defaultValue
 * - string: returned as-is
 */
function parseParamValue<T extends ParamStateValue>(rawValue: string, defaultValue: T): WidenLiteral<T> {
  if (typeof defaultValue === "boolean") {
    if (rawValue === "true") return true as WidenLiteral<T>
    if (rawValue === "false") return false as WidenLiteral<T>
    return defaultValue as WidenLiteral<T>
  }

  if (typeof defaultValue === "number") {
    if (rawValue === "") return defaultValue as WidenLiteral<T>
    const parsed = Number(rawValue)
    return (Number.isNaN(parsed) ? defaultValue : parsed) as WidenLiteral<T>
  }

  return rawValue as WidenLiteral<T>
}

/** Reads a single param from the current URL, falling back to `defaultValue` if absent. */
function readParam<T extends ParamStateValue>(paramKey: string, defaultValue: T): WidenLiteral<T> {
  const params = new URLSearchParams(window.location.search)
  const rawValue = params.get(paramKey)

  if (rawValue === null) {
    return defaultValue as unknown as WidenLiteral<T>
  }

  return parseParamValue(rawValue, defaultValue)
}

function buildUrl(params: URLSearchParams): string {
  const search = params.toString()
  return search
    ? `${window.location.pathname}?${search}${window.location.hash}`
    : `${window.location.pathname}${window.location.hash}`
}

/**
 * Microtask-based batching flag. When multiple params are written in the same
 * synchronous call stack (e.g. `setSortBy(); setSortDirection()`), the first
 * write schedules a microtask to dispatch the change event. Subsequent writes
 * in the same tick see the flag and skip scheduling, so only one event fires
 * after all writes complete. This prevents intermediate renders with partially
 * updated URLs and avoids duplicate network requests from query hooks.
 */
let flushScheduled = false

/**
 * Writes a single param to the URL and schedules a batched notification.
 * The URL is updated synchronously (so reads within the same tick reflect
 * the new value), but the event that triggers React re-renders is deferred
 * to a microtask.
 */
function writeParam(paramKey: string, serialized: string | undefined, history: "push" | "replace") {
  const params = new URLSearchParams(window.location.search)

  if (serialized === undefined) {
    params.delete(paramKey)
  } else {
    params.set(paramKey, serialized)
  }

  const url = buildUrl(params)

  if (history === "push") {
    window.history.pushState(window.history.state, "", url)
  } else {
    window.history.replaceState(window.history.state, "", url)
  }

  if (!flushScheduled) {
    flushScheduled = true
    queueMicrotask(() => {
      flushScheduled = false
      window.dispatchEvent(new Event(PARAM_STATE_CHANGE_EVENT))
    })
  }
}

type ParamStateOptions = {
  /** Whether to push a new history entry or replace the current one. Defaults to "replace". */
  history?: "push" | "replace"
}

/**
 * Optional `validate` narrows the return type to a subset of `WidenLiteral<T>`.
 * Pass a type guard and the hook will fall back to `defaultValue` when the URL
 * contains a value that doesn't pass. This prevents invalid URL-tampered values
 * from flowing into query keys or server calls, and eliminates unsafe `as` casts
 * at the call site.
 *
 * @example
 *   // Without validate — returns [string, setter]
 *   const [tab, setTab] = useParamState("tab", "traces")
 *
 *   // With validate — returns ["asc" | "desc", setter]
 *   const [dir, setDir] = useParamState("dir", "desc", {
 *     validate: (v): v is "asc" | "desc" => v === "asc" || v === "desc",
 *   })
 */
export function useParamState<T extends ParamStateValue, R extends WidenLiteral<T> = WidenLiteral<T>>(
  paramKey: string,
  defaultValue: T,
  options?: ParamStateOptions & { validate?: (value: WidenLiteral<T>) => value is R },
): [R, (next: SetStateAction<R>) => void] {
  const historyMode = options?.history ?? "replace"
  const validate = options?.validate

  const value = useSyncExternalStore(
    subscribe,
    () => {
      const parsed = readParam(paramKey, defaultValue)
      // If validate rejects the parsed value (e.g. URL was manually tampered),
      // fall back to defaultValue so downstream code never sees an invalid state.
      if (validate && !validate(parsed)) return defaultValue as unknown as R
      return parsed as R
    },
    () => defaultValue as unknown as R,
  )

  const setParamValue = (nextValue: SetStateAction<R>) => {
    // Read from the URL (not from `value`) to get the latest state, since
    // another setter in the same tick may have already updated the URL.
    const currentValue = readParam(paramKey, defaultValue) as R
    const resolvedValue = typeof nextValue === "function" ? (nextValue as (prev: R) => R)(currentValue) : nextValue

    // When the value matches the default, remove the param from the URL
    // to keep URLs clean (e.g. `?` instead of `?tab=traces`).
    const serialized = Object.is(resolvedValue, defaultValue) ? undefined : String(resolvedValue)

    writeParam(paramKey, serialized, historyMode)
  }

  return [value, setParamValue]
}
