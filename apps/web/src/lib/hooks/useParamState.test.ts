// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type MockNavigateOptions = {
  to: string
  replace?: boolean
  search?: Record<string, unknown> | ((prev: Record<string, unknown>) => Record<string, unknown>)
}

/**
 * Minimal TanStack Router mock for this hook. We only need `navigate()` and we
 * model it by updating the current URL search string the same way the hook
 * expects in production.
 */
const mockNavigate = vi.fn(async ({ replace, search }: MockNavigateOptions) => {
  const prevSearch = Object.fromEntries(new URLSearchParams(window.location.search).entries())
  const nextSearch = typeof search === "function" ? search(prevSearch) : (search ?? prevSearch)
  const nextParams = new URLSearchParams()

  for (const [key, value] of Object.entries(nextSearch)) {
    if (value === undefined) continue
    nextParams.set(key, String(value))
  }

  const nextUrl = nextParams.toString()
    ? `${window.location.pathname}?${nextParams.toString()}${window.location.hash}`
    : `${window.location.pathname}${window.location.hash}`

  if (replace) {
    window.history.replaceState(null, "", nextUrl)
  } else {
    window.history.pushState(null, "", nextUrl)
  }
})

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    navigate: mockNavigate,
  }),
}))

import { useParamState } from "./useParamState.ts"

/**
 * `useParamState` now updates local React state immediately, but still mirrors
 * the URL in a microtask. Flush microtasks inside `act` when a test needs to
 * observe the final URL.
 */
async function actWithParamFlush(fn: () => void) {
  await act(async () => {
    fn()
    await Promise.resolve()
  })
}

function setUrl(search: string, pathname = window.location.pathname) {
  window.history.replaceState(null, "", search ? `${pathname}${search}` : pathname)
}

// Reset URL + mock state in beforeEach (not afterEach) so the previous test's
// hook has already been unmounted by RTL's auto-cleanup. Otherwise the patched
// replaceState dispatches LOCATION_CHANGE_EVENT to a still-mounted hook,
// triggering an unwrapped setValue and a React act(...) warning.
beforeEach(() => {
  setUrl("", "/")
  mockNavigate.mockClear()
})

function setup<T extends boolean | number | string>(paramKey: string, defaultValue: T) {
  return renderHook(() => useParamState(paramKey, defaultValue))
}

describe("useParamState", () => {
  describe("string params", () => {
    it("returns defaultValue when param is absent", () => {
      const { result } = setup("tab", "traces")
      expect(result.current[0]).toBe("traces")
    })

    it("reads value from URL", () => {
      setUrl("?tab=sessions")
      const { result } = setup("tab", "traces")
      expect(result.current[0]).toBe("sessions")
    })

    it("updates value and URL on set", async () => {
      const { result } = setup("tab", "traces")
      await actWithParamFlush(() => result.current[1]("sessions"))
      expect(result.current[0]).toBe("sessions")
      expect(window.location.search).toBe("?tab=sessions")
    })

    it("commits search updates against the current absolute pathname", async () => {
      setUrl("", "/projects/demo")
      const { result } = setup("tab", "traces")

      await actWithParamFlush(() => result.current[1]("sessions"))

      expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/projects/demo" }))
    })

    it("updates local state before the URL flush runs", async () => {
      const { result } = setup("tab", "traces")

      act(() => {
        result.current[1]("sessions")
      })

      expect(result.current[0]).toBe("sessions")
      expect(window.location.search).toBe("")

      await act(async () => {
        await Promise.resolve()
      })

      expect(window.location.search).toBe("?tab=sessions")
    })

    it("removes param from URL when set to defaultValue", async () => {
      setUrl("?tab=sessions")
      const { result } = setup("tab", "traces")
      await actWithParamFlush(() => result.current[1]("traces"))
      expect(result.current[0]).toBe("traces")
      expect(window.location.search).toBe("")
    })

    it("supports functional updater", async () => {
      setUrl("?count=hello")
      const { result } = setup("greeting", "hi")
      await actWithParamFlush(() => result.current[1]((prev) => `${prev}!`))
      expect(result.current[0]).toBe("hi!")
    })
  })

  describe("boolean params", () => {
    it("returns defaultValue when param is absent", () => {
      const { result } = setup("open", false)
      expect(result.current[0]).toBe(false)
    })

    it("parses 'true' correctly", () => {
      setUrl("?open=true")
      const { result } = setup("open", false)
      expect(result.current[0]).toBe(true)
    })

    it("parses 'false' correctly", () => {
      setUrl("?open=false")
      const { result } = setup("open", true)
      expect(result.current[0]).toBe(false)
    })

    it("falls back to defaultValue for invalid boolean strings", () => {
      setUrl("?open=foo")
      const { result } = setup("open", true)
      expect(result.current[0]).toBe(true)
    })

    it("falls back to defaultValue for empty string", () => {
      setUrl("?open=")
      const { result } = setup("open", true)
      expect(result.current[0]).toBe(true)
    })

    it("removes param when set to defaultValue", async () => {
      setUrl("?open=true")
      const { result } = setup("open", false)
      await actWithParamFlush(() => result.current[1](false))
      expect(window.location.search).toBe("")
    })
  })

  describe("number params", () => {
    it("returns defaultValue when param is absent", () => {
      const { result } = setup("page", 1)
      expect(result.current[0]).toBe(1)
    })

    it("parses valid numbers", () => {
      setUrl("?page=5")
      const { result } = setup("page", 1)
      expect(result.current[0]).toBe(5)
    })

    it("parses zero", () => {
      setUrl("?page=0")
      const { result } = setup("page", 1)
      expect(result.current[0]).toBe(0)
    })

    it("parses negative numbers", () => {
      setUrl("?offset=-10")
      const { result } = setup("offset", 0)
      expect(result.current[0]).toBe(-10)
    })

    it("parses floats", () => {
      setUrl("?ratio=0.75")
      const { result } = setup("ratio", 1)
      expect(result.current[0]).toBe(0.75)
    })

    it("falls back to defaultValue for NaN", () => {
      setUrl("?page=abc")
      const { result } = setup("page", 1)
      expect(result.current[0]).toBe(1)
    })

    it("falls back to defaultValue for empty string", () => {
      setUrl("?page=")
      const { result } = setup("page", 1)
      expect(result.current[0]).toBe(1)
    })
  })

  describe("default-value URL cleanup", () => {
    it("does not put defaultValue in URL on initial render", () => {
      setup("tab", "traces")
      expect(window.location.search).toBe("")
    })

    it("preserves other params when removing one", async () => {
      setUrl("?tab=sessions&page=3")
      const { result } = setup("tab", "traces")
      await actWithParamFlush(() => result.current[1]("traces"))
      expect(window.location.search).toContain("page=3")
      expect(window.location.search).not.toContain("tab=")
    })
  })

  describe("validate option", () => {
    const isDirection = (v: string): v is "asc" | "desc" => v === "asc" || v === "desc"

    it("returns valid values as-is", () => {
      setUrl("?dir=asc")
      const { result } = renderHook(() => useParamState("dir", "desc", { validate: isDirection }))
      expect(result.current[0]).toBe("asc")
    })

    it("falls back to defaultValue for invalid values", () => {
      setUrl("?dir=banana")
      const { result } = renderHook(() => useParamState("dir", "desc", { validate: isDirection }))
      expect(result.current[0]).toBe("desc")
    })

    it("returns defaultValue when param is absent", () => {
      const { result } = renderHook(() => useParamState("dir", "desc", { validate: isDirection }))
      expect(result.current[0]).toBe("desc")
    })
  })

  describe("history mode", () => {
    it("defaults to replace (no new history entry)", async () => {
      const initialLength = window.history.length
      const { result } = setup("tab", "traces")
      await actWithParamFlush(() => result.current[1]("sessions"))
      expect(window.history.length).toBe(initialLength)
    })

    it("pushes a new history entry with history: 'push'", async () => {
      const initialLength = window.history.length
      const { result } = renderHook(() => useParamState("tab", "traces", { history: "push" }))
      await actWithParamFlush(() => result.current[1]("sessions"))
      expect(window.history.length).toBe(initialLength + 1)
    })
  })

  describe("batching", () => {
    it("batches multiple writes into a single render", async () => {
      let renderCount = 0
      const { result } = renderHook(() => {
        renderCount++
        const [sortBy, setSortBy] = useParamState("sortBy", "name")
        const [sortDir, setSortDir] = useParamState("sortDir", "asc")
        return { sortBy, sortDir, setSortBy, setSortDir }
      })

      const countBefore = renderCount
      await act(async () => {
        result.current.setSortBy("date")
        result.current.setSortDir("desc")
        await Promise.resolve()
      })
      const countAfter = renderCount

      expect(result.current.sortBy).toBe("date")
      expect(result.current.sortDir).toBe("desc")
      expect(window.location.search).toContain("sortBy=date")
      expect(window.location.search).toContain("sortDir=desc")
      // Both params updated but only one re-render (not two)
      expect(countAfter - countBefore).toBe(1)
    })
  })

  describe("shared store synchronization", () => {
    it("keeps hooks with the same param key in sync", async () => {
      const first = renderHook(() => useParamState("tab", "traces"))
      const second = renderHook(() => useParamState("tab", "traces"))

      await actWithParamFlush(() => first.result.current[1]("sessions"))

      expect(first.result.current[0]).toBe("sessions")
      expect(second.result.current[0]).toBe("sessions")
      expect(window.location.search).toBe("?tab=sessions")
    })
  })

  describe("location synchronization", () => {
    it("updates when history.replaceState changes the URL", async () => {
      const { result } = setup("tab", "traces")
      expect(result.current[0]).toBe("traces")

      await act(async () => {
        window.history.replaceState(null, "", "?tab=other")
        await Promise.resolve()
      })

      expect(result.current[0]).toBe("other")
    })

    it("updates when popstate fires", async () => {
      setUrl("?tab=sessions")
      const { result } = setup("tab", "traces")
      expect(result.current[0]).toBe("sessions")

      await act(async () => {
        setUrl("?tab=other")
        window.dispatchEvent(new PopStateEvent("popstate"))
        await Promise.resolve()
      })
      expect(result.current[0]).toBe("other")
    })
  })
})
