import { describe, expect, it, vi } from "vitest"
import {
  isStaleServerFnError,
  maybeReloadForStaleServerFn,
  STALE_SERVER_FN_RELOAD_GUARD_MS,
} from "./stale-server-fn.ts"

const staleError = () => new Error("Server function info not found for abc123def456")

const fakeStorage = (initial: Record<string, string> = {}) => {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    snapshot: () => Object.fromEntries(map),
  }
}

describe("isStaleServerFnError", () => {
  it("matches the TanStack stale server-fn error", () => {
    expect(isStaleServerFnError(staleError())).toBe(true)
  })

  it("requires the full `…not found for <id>` shape, not just the phrase", () => {
    // The phrase alone (without a function id) is not the resolver's error.
    expect(isStaleServerFnError(new Error("Server function info not found"))).toBe(false)
  })

  it("ignores unrelated errors and non-Error values", () => {
    expect(isStaleServerFnError(new Error("Database query failed"))).toBe(false)
    expect(isStaleServerFnError("Server function info not found for abc123")).toBe(false)
    expect(isStaleServerFnError(null)).toBe(false)
    expect(isStaleServerFnError({ message: "Server function info not found for abc123" })).toBe(false)
  })
})

describe("maybeReloadForStaleServerFn", () => {
  it("reloads on a stale error when no reload happened before", () => {
    const reload = vi.fn()
    const storage = fakeStorage()

    const reloaded = maybeReloadForStaleServerFn({ error: staleError(), reload, now: 1_000_000, storage })

    expect(reloaded).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(storage.snapshot()).toMatchObject({ "latitude:stale-server-fn-reload-at": "1000000" })
  })

  it("does not reload for unrelated errors", () => {
    const reload = vi.fn()
    const reloaded = maybeReloadForStaleServerFn({
      error: new Error("Boom"),
      reload,
      now: 1_000_000,
      storage: fakeStorage(),
    })

    expect(reloaded).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it("suppresses a second reload within the guard window (no loop)", () => {
    const reload = vi.fn()
    const now = 1_000_000
    const storage = fakeStorage({ "latitude:stale-server-fn-reload-at": String(now - 1_000) })

    const reloaded = maybeReloadForStaleServerFn({ error: staleError(), reload, now, storage })

    expect(reloaded).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it("reloads again once the guard window has elapsed", () => {
    const reload = vi.fn()
    const now = 1_000_000
    const storage = fakeStorage({
      "latitude:stale-server-fn-reload-at": String(now - STALE_SERVER_FN_RELOAD_GUARD_MS - 1),
    })

    const reloaded = maybeReloadForStaleServerFn({ error: staleError(), reload, now, storage })

    expect(reloaded).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("still reloads when storage is unavailable", () => {
    const reload = vi.fn()
    const reloaded = maybeReloadForStaleServerFn({ error: staleError(), reload, now: 1_000_000, storage: null })

    expect(reloaded).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
