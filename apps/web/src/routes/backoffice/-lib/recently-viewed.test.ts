// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  clearRecentViews,
  loadRecentViews,
  MAX_RECENT_ENTRIES,
  recordRecentView,
  STORAGE_KEY,
} from "./recently-viewed.ts"

/**
 * jsdom's bundled `localStorage` is flaky across vitest versions
 * (`.clear()` has been undefined in some matrices). Replace it with a
 * deterministic in-memory store for the duration of these tests so we
 * exercise our code, not the polyfill.
 */
const installInMemoryStorage = () => {
  const data = new Map<string, string>()
  const stub: Storage = {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, String(value))
    },
    removeItem: (key) => {
      data.delete(key)
    },
    key: (index) => Array.from(data.keys())[index] ?? null,
  }
  Object.defineProperty(window, "localStorage", { value: stub, configurable: true, writable: true })
}

const seedStorage = (raw: string) => window.localStorage.setItem(STORAGE_KEY, raw)

describe("recently-viewed storage", () => {
  beforeEach(() => {
    installInMemoryStorage()
  })
  afterEach(() => {
    window.localStorage.clear()
  })

  describe("loadRecentViews", () => {
    it("returns an empty list when nothing is stored", () => {
      expect(loadRecentViews()).toEqual([])
    })

    it("returns the stored list sorted newest first", () => {
      seedStorage(
        JSON.stringify([
          { kind: "user", id: "1", primary: "old", viewedAt: 100 },
          { kind: "user", id: "2", primary: "new", viewedAt: 200 },
        ]),
      )
      const result = loadRecentViews()
      expect(result.map((v) => v.id)).toEqual(["2", "1"])
    })

    it("returns an empty list when the JSON is malformed", () => {
      seedStorage("{not json")
      expect(loadRecentViews()).toEqual([])
    })

    it("returns an empty list when the stored value is not an array", () => {
      seedStorage(JSON.stringify({ accidentally: "an object" }))
      expect(loadRecentViews()).toEqual([])
    })

    it("filters out individual invalid entries instead of dropping the whole list", () => {
      seedStorage(
        JSON.stringify([
          { kind: "user", id: "1", primary: "valid", viewedAt: 100 },
          { kind: "wrong-kind", id: "2", primary: "invalid", viewedAt: 200 },
          { primary: "no kind or id", viewedAt: 300 },
          { kind: "organization", id: "3", primary: "also valid", viewedAt: 400 },
        ]),
      )
      const result = loadRecentViews()
      expect(result.map((v) => v.id)).toEqual(["3", "1"])
    })

    it("accepts entries with optional `secondary`", () => {
      seedStorage(JSON.stringify([{ kind: "project", id: "p1", primary: "Foo", secondary: "/foo", viewedAt: 1 }]))
      expect(loadRecentViews()[0]?.secondary).toBe("/foo")
    })
  })

  describe("recordRecentView", () => {
    it("inserts a new view at the top of the list", () => {
      recordRecentView({ kind: "user", id: "u1", primary: "alice@example.com" })
      const result = loadRecentViews()
      expect(result.map((v) => v.id)).toEqual(["u1"])
      expect(result[0]?.viewedAt).toBeGreaterThan(0)
    })

    it("dedupes by (kind, id) — revisiting moves the entry to the top instead of duplicating", () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"))
      recordRecentView({ kind: "user", id: "u1", primary: "alice@example.com" })

      vi.setSystemTime(new Date("2025-01-01T00:00:01.000Z"))
      recordRecentView({ kind: "user", id: "u2", primary: "bob@example.com" })

      vi.setSystemTime(new Date("2025-01-01T00:00:02.000Z"))
      recordRecentView({ kind: "user", id: "u1", primary: "alice@example.com" })

      const result = loadRecentViews()
      expect(result.map((v) => v.id)).toEqual(["u1", "u2"])
      expect(result).toHaveLength(2)
      vi.useRealTimers()
    })

    it("does NOT dedupe entries with the same id but different kind", () => {
      recordRecentView({ kind: "user", id: "shared", primary: "u" })
      recordRecentView({ kind: "organization", id: "shared", primary: "o" })
      expect(loadRecentViews()).toHaveLength(2)
    })

    it("refreshes cached primary / secondary text on revisit", () => {
      recordRecentView({ kind: "organization", id: "o1", primary: "Old name", secondary: "/old" })
      recordRecentView({ kind: "organization", id: "o1", primary: "New name", secondary: "/new" })
      const [view] = loadRecentViews()
      expect(view?.primary).toBe("New name")
      expect(view?.secondary).toBe("/new")
    })

    it("trims the list to MAX_RECENT_ENTRIES, dropping oldest first", () => {
      for (let i = 0; i < MAX_RECENT_ENTRIES + 5; i++) {
        recordRecentView({ kind: "user", id: `u${i}`, primary: `user-${i}` })
      }
      const result = loadRecentViews()
      expect(result).toHaveLength(MAX_RECENT_ENTRIES)
      // Newest entries kept, oldest dropped.
      expect(result[0]?.id).toBe(`u${MAX_RECENT_ENTRIES + 4}`)
      expect(result[result.length - 1]?.id).toBe("u5")
    })

    it("dispatches the in-tab change event so subscribers in the same tab refresh", () => {
      const listener = vi.fn()
      window.addEventListener("backoffice:recently-viewed-changed", listener)
      recordRecentView({ kind: "user", id: "u1", primary: "x" })
      expect(listener).toHaveBeenCalledTimes(1)
      window.removeEventListener("backoffice:recently-viewed-changed", listener)
    })
  })

  describe("clearRecentViews", () => {
    it("removes the stored list", () => {
      recordRecentView({ kind: "user", id: "u1", primary: "x" })
      expect(loadRecentViews()).toHaveLength(1)
      clearRecentViews()
      expect(loadRecentViews()).toEqual([])
    })

    it("dispatches the change event", () => {
      const listener = vi.fn()
      window.addEventListener("backoffice:recently-viewed-changed", listener)
      clearRecentViews()
      expect(listener).toHaveBeenCalledTimes(1)
      window.removeEventListener("backoffice:recently-viewed-changed", listener)
    })
  })
})
