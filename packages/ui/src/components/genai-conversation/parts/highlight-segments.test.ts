import { describe, expect, it } from "vitest"
import type { HighlightRange } from "../text-selection.tsx"
import { highlightAttributes, segmentForHighlights } from "./highlight-segments.ts"

// ──────────────────────────────────────────────────────────────────────────────
// segmentForHighlights
// ──────────────────────────────────────────────────────────────────────────────

describe("segmentForHighlights", () => {
  it("returns a single plain segment when no highlights overlap", () => {
    const segs = segmentForHighlights("hello world", 0, 11, [])
    expect(segs).toHaveLength(1)
    expect(segs[0]).toMatchObject({
      sourceStart: 0,
      sourceEnd: 11,
      text: "hello world",
      activeHighlight: null,
    })
  })

  it("ignores highlights that do not overlap the source range", () => {
    const h: HighlightRange = { messageIndex: 0, partIndex: 0, startOffset: 20, endOffset: 30, type: "annotation" }
    const segs = segmentForHighlights("hello world", 0, 11, [h])
    expect(segs).toHaveLength(1)
    expect(segs[0]?.activeHighlight).toBeNull()
  })

  it("splits text at highlight boundaries", () => {
    const h: HighlightRange = {
      messageIndex: 0,
      partIndex: 0,
      startOffset: 6,
      endOffset: 11,
      type: "annotation",
      passed: true,
    }
    const segs = segmentForHighlights("hello world", 0, 11, [h])
    expect(segs).toHaveLength(2)
    expect(segs[0]).toMatchObject({ sourceStart: 0, sourceEnd: 6, text: "hello ", activeHighlight: null })
    expect(segs[1]?.sourceStart).toBe(6)
    expect(segs[1]?.sourceEnd).toBe(11)
    expect(segs[1]?.text).toBe("world")
    expect(segs[1]?.activeHighlight).toBe(h)
  })

  it("handles highlight covering entire text", () => {
    const h: HighlightRange = { messageIndex: 0, partIndex: 0, startOffset: 0, endOffset: 11, type: "annotation" }
    const segs = segmentForHighlights("hello world", 0, 11, [h])
    expect(segs).toHaveLength(1)
    expect(segs[0]?.activeHighlight).toBe(h)
  })

  it("handles partial overlap at the start of the source range", () => {
    // source: "world" at offsets 6–11; highlight 0–8 overlaps first 2 chars
    const h: HighlightRange = { messageIndex: 0, partIndex: 0, startOffset: 0, endOffset: 8, type: "annotation" }
    const segs = segmentForHighlights("world", 6, 11, [h])
    expect(segs).toHaveLength(2)
    expect(segs[0]?.text).toBe("wo")
    expect(segs[0]?.activeHighlight).toBe(h)
    expect(segs[1]?.text).toBe("rld")
    expect(segs[1]?.activeHighlight).toBeNull()
  })

  it("handles two non-overlapping highlights", () => {
    const h1: HighlightRange = { messageIndex: 0, partIndex: 0, startOffset: 0, endOffset: 5, type: "annotation" }
    const h2: HighlightRange = { messageIndex: 0, partIndex: 0, startOffset: 6, endOffset: 11, type: "annotation" }
    const segs = segmentForHighlights("hello world", 0, 11, [h1, h2])
    expect(segs).toHaveLength(3)
    expect(segs[0]?.activeHighlight).toBe(h1)
    expect(segs[1]?.activeHighlight).toBeNull()
    expect(segs[2]?.activeHighlight).toBe(h2)
  })

  it("returns no segments for empty text", () => {
    expect(segmentForHighlights("", 0, 0, [])).toEqual([])
  })

  it("returns no segments for invalid range", () => {
    expect(segmentForHighlights("abc", 5, 3, [])).toEqual([])
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// highlightAttributes
// ──────────────────────────────────────────────────────────────────────────────

describe("highlightAttributes", () => {
  it("returns empty attributes for null highlight", () => {
    expect(highlightAttributes(null)).toEqual({})
  })

  it("applies selection styling and data-selected-text", () => {
    const h: HighlightRange = { messageIndex: 0, partIndex: 0, startOffset: 0, endOffset: 5, type: "selection" }
    const attrs = highlightAttributes(h)
    expect(attrs["data-selected-text"]).toBe(true)
    expect(attrs["data-annotated-text"]).toBeUndefined()
    expect(attrs.className).toContain("bg-yellow-100")
    expect(attrs.className).toContain("border-b-2")
  })

  it("applies red for annotation passed=false", () => {
    const h: HighlightRange = {
      messageIndex: 0,
      partIndex: 0,
      startOffset: 0,
      endOffset: 5,
      type: "annotation",
      passed: false,
    }
    const attrs = highlightAttributes(h)
    expect(attrs.className).toContain("bg-red-100")
    expect(attrs["data-annotated-text"]).toBe(true)
  })

  it("applies emerald for annotation passed=true", () => {
    const h: HighlightRange = {
      messageIndex: 0,
      partIndex: 0,
      startOffset: 0,
      endOffset: 5,
      type: "annotation",
      passed: true,
    }
    expect(highlightAttributes(h).className).toContain("bg-emerald-100")
  })

  it("applies blue for annotation with undefined passed", () => {
    const h: HighlightRange = { messageIndex: 0, partIndex: 0, startOffset: 0, endOffset: 5, type: "annotation" }
    expect(highlightAttributes(h).className).toContain("bg-blue-100")
  })

  it("includes cursor-pointer and annotation id when id present", () => {
    const h: HighlightRange = {
      messageIndex: 0,
      partIndex: 0,
      startOffset: 0,
      endOffset: 5,
      type: "annotation",
      passed: true,
      id: "ann-1",
    }
    const attrs = highlightAttributes(h)
    expect(attrs.className).toContain("cursor-pointer")
    expect(attrs.className).toContain("hit-area-inline-y-2")
    expect(attrs["data-annotation-id"]).toBe("ann-1")
  })

  it("omits cursor-pointer and annotation id when id missing", () => {
    const h: HighlightRange = { messageIndex: 0, partIndex: 0, startOffset: 0, endOffset: 5, type: "annotation" }
    const attrs = highlightAttributes(h)
    expect(attrs.className).not.toContain("cursor-pointer")
    expect(attrs["data-annotation-id"]).toBeUndefined()
  })
})
