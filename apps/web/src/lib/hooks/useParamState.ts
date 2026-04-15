import { useRouter } from "@tanstack/react-router"
import { type SetStateAction, useEffect, useRef, useState } from "react"

type ParamStateValue = boolean | number | string

/**
 * Widens literal types to their base type so the setter accepts any value of
 * that base type, not just the exact literal passed as `defaultValue`.
 * e.g. `useParamState("tab", "traces")` returns `[string, setter]` not
 * `["traces", setter]`.
 */
type WidenLiteral<T> = T extends string ? string : T extends number ? number : T extends boolean ? boolean : T

type ParamStateSyncDetail = {
  paramKey: string
  rawValue: string | null
  sourceId: number
}

/**
 * Pending URL writes are keyed by param so several setters in the same tick can
 * collapse into a single router navigation.
 */
type PendingUrlUpdate = {
  searchValue: ParamStateValue | null
  history: "push" | "replace"
}

/** Broadcast name used to fan out same-key updates to hook instances in this tab. */
const PARAM_STATE_SYNC_EVENT = "param-state-sync"
/** Broadcast name used to notify hooks when any history write changes the URL. */
const LOCATION_CHANGE_EVENT = "param-state-location-change"
/** In-memory snapshot of the latest raw value for each known param key. */
const latestRawValuesByKey = new Map<string, string | null>()
/** Queue of URL writes waiting to be flushed after React has updated local state. */
const pendingUrlUpdates = new Map<string, PendingUrlUpdate>()

/** Ensures the history monkey-patch is installed only once per page. */
let historyPatched = false
/** Guards the microtask that flushes pending URL updates. */
let urlFlushScheduled = false
/** Invalidates stale flush microtasks after external navigation wins. */
let urlFlushVersion = 0
/** Simple instance id generator so senders can ignore their own sync events. */
let nextSourceId = 0

/** Narrow router shape used by this hook when committing URL changes. */
type ParamStateRouter = Pick<ReturnType<typeof useRouter>, "navigate">

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

/** Reads a raw search param string directly from the current browser URL. */
function readRawParam(paramKey: string) {
  return new URLSearchParams(window.location.search).get(paramKey)
}

/**
 * Returns the freshest raw value we know for a param.
 * While a local write is still pending, the in-memory snapshot wins; otherwise
 * the browser URL becomes authoritative again.
 */
function getCurrentRawValue(paramKey: string) {
  if (pendingUrlUpdates.has(paramKey) && latestRawValuesByKey.has(paramKey)) {
    return latestRawValuesByKey.get(paramKey) ?? null
  }

  const rawValue = readRawParam(paramKey)
  latestRawValuesByKey.set(paramKey, rawValue)
  return rawValue
}

/** Updates the in-memory snapshot so newly mounted hooks see the latest local value. */
function setCurrentRawValue(paramKey: string, rawValue: string | null) {
  latestRawValuesByKey.set(paramKey, rawValue)
}

/** Reads a single param value, falling back to `defaultValue` if absent. */
function readParam<T extends ParamStateValue>(rawValue: string | null, defaultValue: T): WidenLiteral<T> {
  if (rawValue === null) {
    return defaultValue as unknown as WidenLiteral<T>
  }

  return parseParamValue(rawValue, defaultValue)
}

/**
 * Applies the optional runtime validator so malformed URL values never escape
 * into component state.
 */
function resolveValue<T extends ParamStateValue, R extends WidenLiteral<T>>(
  rawValue: string | null,
  defaultValue: T,
  validate?: (value: WidenLiteral<T>) => value is R,
) {
  const parsed = readParam(rawValue, defaultValue)
  if (validate && !validate(parsed)) return defaultValue as unknown as R
  return parsed as R
}

/**
 * Flushes all queued URL writes through TanStack Router so search updates follow
 * the router's supported navigation lifecycle instead of mutating history
 * behind its back.
 */
function flushPendingUrlUpdates(router: ParamStateRouter, flushVersion: number) {
  if (pendingUrlUpdates.size === 0) return

  const updates = Array.from(pendingUrlUpdates.entries())
  const replace = !updates.some(([, update]) => update.history === "push")
  const currentPathname = window.location.pathname || "/"

  void router
    .navigate({
      // Use the concrete current pathname instead of "." because relative
      // current-route navigation can resolve against pathless layout routes.
      to: currentPathname,
      replace,
      resetScroll: false,
      hashScrollIntoView: false,
      search: (prev: Record<string, unknown>) => {
        const nextSearch = { ...prev } as Record<string, unknown>
        for (const [paramKey, update] of updates) {
          if (update.searchValue === null) {
            delete nextSearch[paramKey]
          } else {
            nextSearch[paramKey] = update.searchValue
          }
        }
        return nextSearch
      },
    })
    .finally(() => {
      if (flushVersion !== urlFlushVersion) return
      pendingUrlUpdates.clear()
    })
}

/** Discards queued URL writes when the browser location changes externally. */
function cancelPendingUrlFlush() {
  pendingUrlUpdates.clear()
  urlFlushScheduled = false
  urlFlushVersion++
}

/** Queues a param write so the URL can update after local React state has updated. */
function scheduleUrlFlush(
  router: ParamStateRouter,
  paramKey: string,
  searchValue: ParamStateValue | null,
  history: "push" | "replace",
) {
  const existing = pendingUrlUpdates.get(paramKey)
  pendingUrlUpdates.set(paramKey, {
    searchValue,
    history: existing?.history === "push" || history === "push" ? "push" : "replace",
  })

  if (urlFlushScheduled) return

  urlFlushScheduled = true
  const scheduledVersion = ++urlFlushVersion
  queueMicrotask(() => {
    if (scheduledVersion !== urlFlushVersion) return

    urlFlushScheduled = false
    flushPendingUrlUpdates(router, scheduledVersion)
  })
}

/** Installs a single history patch so direct `pushState`/`replaceState` calls are observable. */
function ensureLocationTracking() {
  if (historyPatched) return

  const originalPushState = window.history.pushState.bind(window.history)
  const originalReplaceState = window.history.replaceState.bind(window.history)

  window.history.pushState = ((...args) => {
    originalPushState(...args)
    window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT))
  }) as History["pushState"]

  window.history.replaceState = ((...args) => {
    originalReplaceState(...args)
    window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT))
  }) as History["replaceState"]

  historyPatched = true
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
  /** Router instance used to commit supported same-route search updates. */
  const router = useRouter()
  /** Chosen history mode for URL mirroring; local state updates always remain synchronous. */
  const historyMode = options?.history ?? "replace"
  /** Optional caller-provided guard that narrows the returned value type. */
  const validate = options?.validate
  /** Stable instance id so same-key broadcasts can skip the sender. */
  const [sourceId] = useState(() => nextSourceId++)
  /** The rendered value lives in local React state for immediate UI response. */
  const [value, setValue] = useState<R>(() => resolveValue(getCurrentRawValue(paramKey), defaultValue, validate))
  /** Tracks the latest committed value so functional updaters stay in sync across events. */
  const valueRef = useRef(value)
  valueRef.current = value
  /** Holds the latest validator without forcing browser listener re-subscription. */
  const validateRef = useRef(validate)
  validateRef.current = validate

  // TODO(frontend-use-effect-policy): this hook must subscribe to browser events to mirror URL/history state.
  useEffect(() => {
    ensureLocationTracking()

    /**
     * Applies an incoming raw value from either the browser URL or a sibling
     * hook instance, updating both the shared snapshot and local React state.
     */
    const syncFromRawValue = (rawValue: string | null) => {
      setCurrentRawValue(paramKey, rawValue)
      const nextValue = resolveValue(rawValue, defaultValue, validateRef.current)
      if (Object.is(valueRef.current, nextValue)) return

      valueRef.current = nextValue
      setValue(nextValue)
    }

    /** Handles synchronous same-tab broadcasts from other `useParamState` instances. */
    const handleSyncEvent = (event: Event) => {
      const detail = (event as CustomEvent<ParamStateSyncDetail>).detail
      if (detail.paramKey !== paramKey) return
      if (detail.sourceId === sourceId) return

      syncFromRawValue(detail.rawValue)
    }

    /** Re-reads the current URL after back/forward or direct history mutations. */
    const handleLocationChange = () => {
      const nextRawValue = readRawParam(paramKey)
      cancelPendingUrlFlush()
      syncFromRawValue(nextRawValue)
    }

    syncFromRawValue(getCurrentRawValue(paramKey))
    window.addEventListener(PARAM_STATE_SYNC_EVENT, handleSyncEvent)
    window.addEventListener(LOCATION_CHANGE_EVENT, handleLocationChange)
    window.addEventListener("popstate", handleLocationChange)

    return () => {
      window.removeEventListener(PARAM_STATE_SYNC_EVENT, handleSyncEvent)
      window.removeEventListener(LOCATION_CHANGE_EVENT, handleLocationChange)
      window.removeEventListener("popstate", handleLocationChange)
    }
  }, [defaultValue, paramKey, sourceId])

  /** Updates local state immediately, then mirrors that change to peers and the URL. */
  const setParamValue = (nextValue: SetStateAction<R>) => {
    const currentValue = valueRef.current
    const resolvedValue = typeof nextValue === "function" ? (nextValue as (prev: R) => R)(currentValue) : nextValue
    const isDefaultValue = Object.is(resolvedValue, defaultValue)
    const rawValue = isDefaultValue ? null : String(resolvedValue)
    const searchValue = isDefaultValue ? null : (resolvedValue as ParamStateValue)
    if (getCurrentRawValue(paramKey) === rawValue) return

    setCurrentRawValue(paramKey, rawValue)
    valueRef.current = resolvedValue
    setValue(resolvedValue)
    window.dispatchEvent(
      new CustomEvent<ParamStateSyncDetail>(PARAM_STATE_SYNC_EVENT, {
        detail: {
          paramKey,
          rawValue,
          sourceId,
        },
      }),
    )
    scheduleUrlFlush(router, paramKey, searchValue, historyMode)
  }

  return [value, setParamValue]
}
