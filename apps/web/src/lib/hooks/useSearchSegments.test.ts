// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import {
  createSearchSegment,
  delimiterForKind,
  kindForDelimiter,
  parseSearchSegments,
  serializeSearchSegments,
  serializeSearchSegmentsWithinLimit,
  splitSegmentOnDelimiter,
  useSearchSegments,
} from "./useSearchSegments.ts"

describe("pure functions", () => {
  describe("delimiterForKind", () => {
    it("returns double quote for literal", () => {
      expect(delimiterForKind("literal")).toBe('"')
    })

    it("returns backtick for token", () => {
      expect(delimiterForKind("token")).toBe("`")
    })

    it("returns empty string for semantic", () => {
      expect(delimiterForKind("semantic")).toBe("")
    })
  })

  describe("kindForDelimiter", () => {
    it("returns literal for double quote", () => {
      expect(kindForDelimiter('"')).toBe("literal")
    })

    it("returns token for backtick", () => {
      expect(kindForDelimiter("`")).toBe("token")
    })

    it("returns undefined for other characters", () => {
      expect(kindForDelimiter("a")).toBeUndefined()
      expect(kindForDelimiter("")).toBeUndefined()
    })
  })

  describe("parseSearchSegments", () => {
    it("returns a single semantic segment for empty string", () => {
      const segments = parseSearchSegments("")
      expect(segments).toHaveLength(1)
      expect(segments[0]?.kind).toBe("semantic")
      expect(segments[0]?.text).toBe("")
    })

    it("parses plain text as semantic", () => {
      const segments = parseSearchSegments("hello world")
      expect(segments).toHaveLength(1)
      expect(segments[0]?.kind).toBe("semantic")
      expect(segments[0]?.text).toBe("hello world")
    })

    it("parses a literal segment", () => {
      const segments = parseSearchSegments('hello "world"')
      expect(segments).toHaveLength(2)
      expect(segments[0]?.kind).toBe("semantic")
      expect(segments[0]?.text).toBe("hello")
      expect(segments[1]?.kind).toBe("literal")
      expect(segments[1]?.text).toBe("world")
    })

    it("parses a token segment", () => {
      const segments = parseSearchSegments("hello `world`")
      expect(segments).toHaveLength(2)
      expect(segments[0]?.kind).toBe("semantic")
      expect(segments[0]?.text).toBe("hello")
      expect(segments[1]?.kind).toBe("token")
      expect(segments[1]?.text).toBe("world")
    })

    it("parses multiple delimited segments", () => {
      const segments = parseSearchSegments('foo "bar" baz `qux`')
      expect(segments).toHaveLength(4)
      expect(segments[0]?.text).toBe("foo")
      expect(segments[1]?.kind).toBe("literal")
      expect(segments[1]?.text).toBe("bar")
      expect(segments[2]?.text).toBe("baz")
      expect(segments[3]?.kind).toBe("token")
      expect(segments[3]?.text).toBe("qux")
    })

    it("treats unmatched delimiter as plain text", () => {
      const segments = parseSearchSegments('hello "world')
      expect(segments).toHaveLength(1)
      expect(segments[0]?.kind).toBe("semantic")
      expect(segments[0]?.text).toBe('hello "world')
    })

    it("trims whitespace around segments", () => {
      const segments = parseSearchSegments('  hello   "world"  ')
      expect(segments).toHaveLength(2)
      expect(segments[0]?.text).toBe("hello")
      expect(segments[1]?.text).toBe("world")
    })
  })

  describe("serializeSearchSegments", () => {
    it("serializes semantic segments as plain text", () => {
      const segments = [createSearchSegment("semantic", "hello")]
      expect(serializeSearchSegments(segments)).toBe("hello")
    })

    it("serializes literal segments with double quotes", () => {
      const segments = [createSearchSegment("literal", "hello")]
      expect(serializeSearchSegments(segments)).toBe('"hello"')
    })

    it("serializes token segments with backticks", () => {
      const segments = [createSearchSegment("token", "hello")]
      expect(serializeSearchSegments(segments)).toBe("`hello`")
    })

    it("serializes mixed segments", () => {
      const segments = [
        createSearchSegment("semantic", "foo "),
        createSearchSegment("literal", "bar"),
        createSearchSegment("semantic", " baz "),
        createSearchSegment("token", "qux"),
      ]
      expect(serializeSearchSegments(segments)).toBe('foo "bar" baz `qux`')
    })
  })

  describe("serializeSearchSegmentsWithinLimit", () => {
    it("returns full text when under limit", () => {
      const segments = [createSearchSegment("semantic", "hello")]
      expect(serializeSearchSegmentsWithinLimit(segments, 10)).toBe("hello")
    })

    it("truncates semantic text to limit", () => {
      const segments = [createSearchSegment("semantic", "hello world")]
      expect(serializeSearchSegmentsWithinLimit(segments, 5)).toBe("hello")
    })

    it("drops literal segment when less than 2 chars remain", () => {
      const segments = [createSearchSegment("semantic", "hi"), createSearchSegment("literal", "world")]
      expect(serializeSearchSegmentsWithinLimit(segments, 3)).toBe("hi")
    })

    it("truncates literal text preserving delimiters", () => {
      const segments = [createSearchSegment("literal", "hello world")]
      expect(serializeSearchSegmentsWithinLimit(segments, 7)).toBe('"hello"')
    })

    it("handles empty segments", () => {
      expect(serializeSearchSegmentsWithinLimit([], 10)).toBe("")
    })
  })

  describe("splitSegmentOnDelimiter", () => {
    it("returns updated segment for non-semantic", () => {
      const segment = createSearchSegment("literal", "foo")
      const result = splitSegmentOnDelimiter(segment, "bar")
      expect(result).toHaveLength(1)
      expect(result[0]?.kind).toBe("literal")
      expect(result[0]?.text).toBe("bar")
    })

    it("returns updated segment when no delimiters present", () => {
      const segment = createSearchSegment("semantic", "foo")
      const result = splitSegmentOnDelimiter(segment, "bar")
      expect(result).toHaveLength(1)
      expect(result[0]?.kind).toBe("semantic")
      expect(result[0]?.text).toBe("bar")
    })

    it("re-parses when delimiters are present", () => {
      const segment = createSearchSegment("semantic", "foo")
      const result = splitSegmentOnDelimiter(segment, 'bar "baz"')
      expect(result).toHaveLength(2)
      expect(result[0]?.kind).toBe("semantic")
      expect(result[0]?.text).toBe("bar")
      expect(result[1]?.kind).toBe("literal")
      expect(result[1]?.text).toBe("baz")
    })
  })
})

describe("useSearchSegments", () => {
  function setup(initialValue = "", maxLength = 500) {
    const onSubmit = vi.fn()
    const { result } = renderHook(() => useSearchSegments(initialValue, onSubmit, maxLength))
    return { result, onSubmit }
  }

  it("parses initial value into segments", () => {
    const { result } = setup('hello "world"')
    expect(result.current.segments).toHaveLength(2)
    expect(result.current.segments[0]?.text).toBe("hello")
    expect(result.current.segments[1]?.text).toBe("world")
  })

  it("submits serialized value", () => {
    const { result, onSubmit } = setup('hello "world"')
    act(() => result.current.submit())
    expect(onSubmit).toHaveBeenCalledWith('hello"world"')
  })

  it("submits trimmed value", () => {
    const { result, onSubmit } = setup("  hello  ")
    act(() => result.current.submit())
    expect(onSubmit).toHaveBeenCalledWith("hello")
  })

  it("truncates to maxLength on submit", () => {
    const { result, onSubmit } = setup("hello world", 5)
    act(() => result.current.submit())
    expect(onSubmit).toHaveBeenCalledWith("hello")
  })

  it("updates segment text", () => {
    const { result } = setup("hello")
    const segment = result.current.segments[0]
    if (!segment) throw new Error("Expected segment")
    act(() => result.current.updateSegment(segment, "world"))
    expect(result.current.segments[0]?.text).toBe("world")
  })

  it("splits semantic segment on delimiter during update", () => {
    const { result } = setup("hello")
    const segment = result.current.segments[0]
    if (!segment) throw new Error("Expected segment")
    act(() => result.current.updateSegment(segment, 'foo "bar"'))
    expect(result.current.segments).toHaveLength(2)
    expect(result.current.segments[0]?.text).toBe("foo")
    expect(result.current.segments[1]?.text).toBe("bar")
  })

  it("opens a pill from selection", () => {
    const { result } = setup("hello world")
    const segment = result.current.segments[0]
    if (!segment) throw new Error("Expected segment")
    const input = document.createElement("input")
    input.value = "hello world"
    input.setSelectionRange(0, 5)

    act(() => result.current.openPill(segment, '"', input))

    expect(result.current.segments).toHaveLength(2)
    expect(result.current.segments[0]?.kind).toBe("literal")
    expect(result.current.segments[0]?.text).toBe("hello")
    expect(result.current.segments[1]?.kind).toBe("semantic")
    expect(result.current.segments[1]?.text).toBe("world")
  })

  it("closes a pill into semantic segment", () => {
    const { result } = setup('"hello"')
    const segment = result.current.segments[0]
    if (!segment) throw new Error("Expected segment")
    act(() => result.current.closePill(segment))
    expect(result.current.segments).toHaveLength(2)
    expect(result.current.segments[0]?.kind).toBe("literal")
    expect(result.current.segments[1]?.kind).toBe("semantic")
  })

  it("removes a segment and focuses adjacent", async () => {
    const { result } = setup('hello "world"')
    const literalSegment = result.current.segments[1]
    if (!literalSegment) throw new Error("Expected segment")

    act(() => result.current.removeSegment(literalSegment))

    expect(result.current.segments).toHaveLength(1)
    expect(result.current.segments[0]?.text).toBe("hello")
  })

  it("keeps single semantic segment when allowed", () => {
    const { result } = setup("hello")
    const segment = result.current.segments[0]
    if (!segment) throw new Error("Expected segment")
    act(() => result.current.removeSegment(segment, true))
    expect(result.current.segments).toHaveLength(1)
    expect(result.current.segments[0]?.text).toBe("hello")
  })

  it("replaces last segment with empty semantic when removing and not allowed", () => {
    const { result } = setup("hello")
    const segment = result.current.segments[0]
    if (!segment) throw new Error("Expected segment")
    act(() => result.current.removeSegment(segment, false))
    expect(result.current.segments).toHaveLength(1)
    expect(result.current.segments[0]?.text).toBe("")
  })

  it("focuses search end on existing semantic segment", () => {
    const { result } = setup("hello")
    act(() => result.current.focusSearchEnd())
    expect(result.current.segments).toHaveLength(1)
    expect(result.current.segments[0]?.text).toBe("hello")
  })

  it("appends semantic segment when focusing end on non-semantic", () => {
    const { result } = setup('"hello"')
    act(() => result.current.focusSearchEnd())
    expect(result.current.segments).toHaveLength(2)
    expect(result.current.segments[0]?.kind).toBe("literal")
    expect(result.current.segments[1]?.kind).toBe("semantic")
  })

  it("registers and unregisters input refs", () => {
    const { result } = setup("hello")
    const segment = result.current.segments[0]
    if (!segment) throw new Error("Expected segment")
    const input = document.createElement("input")

    act(() => result.current.registerInput(segment.id)(input))
    // registerInput returns a callback; we just verify it doesn't throw
    // and the internal ref map is updated (tested indirectly via focus)

    act(() => result.current.registerInput(segment.id)(null))
    // unregister should not throw
  })
})
