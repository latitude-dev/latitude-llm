import { useCallback, useSyncExternalStore } from "react"

function buildKey(key: string): string {
  return `latitude:${key}`
}

const isLocalStorageAvailable = (() => {
  try {
    const testKey = "__test__"
    localStorage.setItem(testKey, testKey)
    localStorage.removeItem(testKey)
    return true
  } catch {
    return false
  }
})()

function readValue<T>(key: string, defaultValue: T): T {
  if (!isLocalStorageAvailable) return defaultValue
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return defaultValue
    return JSON.parse(raw) as T
  } catch {
    return defaultValue
  }
}

const cache = new Map<string, unknown>()
const subscribers = new Map<string, Set<() => void>>()

function subscribe(key: string, onStoreChange: () => void): () => void {
  let set = subscribers.get(key)
  if (!set) {
    set = new Set()
    subscribers.set(key, set)
  }
  set.add(onStoreChange)
  return () => {
    set.delete(onStoreChange)
    if (set.size === 0) subscribers.delete(key)
  }
}

function emitChange(key: string) {
  for (const cb of subscribers.get(key) ?? []) cb()
}

type SetAction<T> = T | ((prev: T) => T)

const NOOP_SET = () => {}

export function useLocalStorage<T>({
  key,
  defaultValue,
}: {
  readonly key: string | undefined
  readonly defaultValue: T
}): {
  readonly value: T
  readonly setValue: (action: SetAction<T>) => void
} {
  const fullKey = key !== undefined ? buildKey(key) : undefined

  const value = useSyncExternalStore(
    (cb) => (fullKey ? subscribe(fullKey, cb) : () => {}),
    () => {
      if (!fullKey) return defaultValue
      if (!cache.has(fullKey)) {
        cache.set(fullKey, readValue(fullKey, defaultValue))
      }
      return cache.get(fullKey) as T
    },
    () => defaultValue,
  )

  const setValue = useCallback(
    (action: SetAction<T>) => {
      if (!fullKey) return
      const current = cache.has(fullKey) ? (cache.get(fullKey) as T) : readValue(fullKey, defaultValue)
      const next = action instanceof Function ? action(current) : action
      cache.set(fullKey, next)
      if (isLocalStorageAvailable) {
        try {
          localStorage.setItem(fullKey, JSON.stringify(next))
        } catch {
          // quota exceeded or unavailable
        }
      }
      emitChange(fullKey)
    },
    [fullKey, defaultValue],
  )

  return { value, setValue: fullKey ? setValue : (NOOP_SET as (action: SetAction<T>) => void) }
}
