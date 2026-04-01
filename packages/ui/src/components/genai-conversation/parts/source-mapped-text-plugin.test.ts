import { describe, expect, it, vi } from "vitest"
import type { HighlightRange } from "../text-selection.tsx"
import { type HastNode, sourceMappedTextPlugin } from "./source-mapped-text-plugin.ts"

// Runs the plugin transformer on a tree and returns the mutated tree.
function run(tree: HastNode, highlights: HighlightRange[] = []): HastNode {
  sourceMappedTextPlugin(highlights)()(tree)
  return tree
}

// Builds a minimal text node with source position info.
function textNode(value: string, start: number, end: number): HastNode {
  return {
    type: "text",
    value,
    position: { start: { offset: start }, end: { offset: end } },
  }
}

function rootWith(...children: HastNode[]): HastNode {
  return { type: "root", children }
}

// --- Helpers to inspect output ---

function children(tree: HastNode): HastNode[] {
  return tree.children ?? []
}

function props(node: HastNode | undefined): Record<string, unknown> {
  return node?.properties ?? {}
}

// ──────────────────────────────────────────────────────────────────────────────
// No highlights
// ──────────────────────────────────────────────────────────────────────────────

describe("no highlights", () => {
  it("wraps a plain text node in a span with source coordinates", () => {
    const tree = rootWith(textNode("hello world", 0, 11))
    run(tree)
    const [span] = children(tree)
    expect(span?.tagName).toBe("span")
    expect(props(span)["data-source-start"]).toBe("0")
    expect(props(span)["data-source-end"]).toBe("11")
    expect(span?.children?.[0]?.value).toBe("hello world")
  })

  it("skips text nodes with missing position info", () => {
    const node: HastNode = { type: "text", value: "no position" }
    const tree = rootWith(node)
    run(tree)
    // Node should pass through unchanged
    expect(children(tree)[0]).toBe(node)
  })

  it("skips text nodes with empty value", () => {
    const node = textNode("", 0, 0)
    const tree = rootWith(node)
    run(tree)
    expect(children(tree)[0]).toBe(node)
  })

  it("recurses into non-text element children", () => {
    const inner = textNode("deep", 0, 4)
    const wrapper: HastNode = { type: "element", tagName: "p", children: [inner] }
    const tree = rootWith(wrapper)
    run(tree)
    const [p] = children(tree)
    const [span] = p?.children ?? []
    expect(span?.tagName).toBe("span")
    expect(span?.children?.[0]?.value).toBe("deep")
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Class generation
// ──────────────────────────────────────────────────────────────────────────────

describe("className generation", () => {
  it("applies selection classes for type=selection", () => {
    const h: HighlightRange = { messageIndex: 0, partIndex: 0, startOffset: 0, endOffset: 5, type: "selection" }
    const tree = rootWith(textNode("hello world", 0, 11))
    run(tree, [h])
    const highlighted = children(tree).find((n) => props(n)["data-selected-text"])
    expect(props(highlighted).className).toContain("bg-yellow-100")
    expect(props(highlighted).className).toContain("border-b-2")
  })

  it("applies red classes for passed=false annotation", () => {
    const h: HighlightRange = {
      messageIndex: 0,
      partIndex: 0,
      startOffset: 0,
      endOffset: 5,
      type: "annotation",
      passed: false,
    }
    const tree = rootWith(textNode("hello world", 0, 11))
    run(tree, [h])
    const highlighted = children(tree).find((n) => props(n)["data-annotated-text"])
    expect(props(highlighted).className).toContain("bg-red-100")
  })

  it("applies green classes for passed=true annotation", () => {
    const h: HighlightRange = {
      messageIndex: 0,
      partIndex: 0,
      startOffset: 0,
      endOffset: 5,
      type: "annotation",
      passed: true,
    }
    const tree = rootWith(textNode("hello world", 0, 11))
    run(tree, [h])
    const highlighted = children(tree).find((n) => props(n)["data-annotated-text"])
    expect(props(highlighted).className).toContain("bg-emerald-100")
  })

  it("applies blue classes for annotation with no passed value", () => {
    const h: HighlightRange = { messageIndex: 0, partIndex: 0, startOffset: 0, endOffset: 5, type: "annotation" }
    const tree = rootWith(textNode("hello world", 0, 11))
    run(tree, [h])
    const highlighted = children(tree).find((n) => props(n)["data-annotated-text"])
    expect(props(highlighted).className).toContain("bg-blue-100")
  })

  it("adds cursor-pointer when highlight has onClick", () => {
    const h: HighlightRange = {
      messageIndex: 0,
      partIndex: 0,
      startOffset: 0,
      endOffset: 5,
      type: "annotation",
      passed: true,
      onClick: vi.fn(),
    }
    const tree = rootWith(textNode("hello world", 0, 11))
    run(tree, [h])
    const highlighted = children(tree).find((n) => props(n)["data-annotated-text"])
    expect(props(highlighted).className).toContain("cursor-pointer")
  })

  it("does not add cursor-pointer when highlight has no onClick", () => {
    const h: HighlightRange = {
      messageIndex: 0,
      partIndex: 0,
      startOffset: 0,
      endOffset: 5,
      type: "annotation",
      passed: true,
    }
    const tree = rootWith(textNode("hello world", 0, 11))
    run(tree, [h])
    const highlighted = children(tree).find((n) => props(n)["data-annotated-text"])
    expect(props(highlighted).className).not.toContain("cursor-pointer")
  })

  it("does not apply className to non-highlighted segments", () => {
    const h: HighlightRange = {
      messageIndex: 0,
      partIndex: 0,
      startOffset: 6,
      endOffset: 11,
      type: "annotation",
      passed: true,
    }
    const tree = rootWith(textNode("hello world", 0, 11))
    run(tree, [h])
    const plain = children(tree).find((n) => !props(n)["data-annotated-text"])
    expect(props(plain).className).toBeFalsy()
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Tag name (button vs span)
// ──────────────────────────────────────────────────────────────────────────────

describe("tagName", () => {
  it("renders a button when highlight has onClick", () => {
    const h: HighlightRange = {
      messageIndex: 0,
      partIndex: 0,
      startOffset: 0,
      endOffset: 5,
      type: "annotation",
      onClick: vi.fn(),
    }
    const tree = rootWith(textNode("hello world", 0, 11))
    run(tree, [h])
    const annotated = children(tree).find((n) => props(n)["data-annotated-text"])
    expect(annotated?.tagName).toBe("button")
  })

  it("renders a span when highlight has no onClick", () => {
    const h: HighlightRange = { messageIndex: 0, partIndex: 0, startOffset: 0, endOffset: 5, type: "annotation" }
    const tree = rootWith(textNode("hello world", 0, 11))
    run(tree, [h])
    const annotated = children(tree).find((n) => props(n)["data-annotated-text"])
    expect(annotated?.tagName).toBe("span")
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Data attributes
// ──────────────────────────────────────────────────────────────────────────────

describe("data attributes", () => {
  it("sets data-selected-text for selection highlights", () => {
    const h: HighlightRange = { messageIndex: 0, partIndex: 0, startOffset: 0, endOffset: 5, type: "selection" }
    const tree = rootWith(textNode("hello world", 0, 11))
    run(tree, [h])
    const sel = children(tree).find((n) => props(n)["data-selected-text"])
    expect(sel).toBeDefined()
    expect(props(sel)["data-annotated-text"]).toBeUndefined()
  })

  it("sets data-annotated-text for annotation highlights", () => {
    const h: HighlightRange = { messageIndex: 0, partIndex: 0, startOffset: 0, endOffset: 5, type: "annotation" }
    const tree = rootWith(textNode("hello world", 0, 11))
    run(tree, [h])
    const ann = children(tree).find((n) => props(n)["data-annotated-text"])
    expect(ann).toBeDefined()
    expect(props(ann)["data-selected-text"]).toBeUndefined()
  })

  it("sets data-annotation-id when highlight has an id", () => {
    const h: HighlightRange = {
      messageIndex: 0,
      partIndex: 0,
      startOffset: 0,
      endOffset: 5,
      type: "annotation",
      id: "ann-42",
    }
    const tree = rootWith(textNode("hello world", 0, 11))
    run(tree, [h])
    const ann = children(tree).find((n) => props(n)["data-annotated-text"])
    expect(props(ann)["data-annotation-id"]).toBe("ann-42")
  })

  it("omits data-annotation-id when highlight has no id", () => {
    const h: HighlightRange = { messageIndex: 0, partIndex: 0, startOffset: 0, endOffset: 5, type: "annotation" }
    const tree = rootWith(textNode("hello world", 0, 11))
    run(tree, [h])
    const ann = children(tree).find((n) => props(n)["data-annotated-text"])
    expect(props(ann)["data-annotation-id"]).toBeUndefined()
  })

  it("sets data-source-start and data-source-end on every segment", () => {
    const h: HighlightRange = { messageIndex: 0, partIndex: 0, startOffset: 6, endOffset: 11, type: "annotation" }
    const tree = rootWith(textNode("hello world", 0, 11))
    run(tree, [h])
    for (const node of children(tree)) {
      expect(props(node)["data-source-start"]).toBeDefined()
      expect(props(node)["data-source-end"]).toBeDefined()
    }
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Segment splitting
// ──────────────────────────────────────────────────────────────────────────────

describe("segment splitting", () => {
  it("splits text into highlighted and non-highlighted segments", () => {
    // "hello world" — highlight "world" (offsets 6-11)
    const h: HighlightRange = {
      messageIndex: 0,
      partIndex: 0,
      startOffset: 6,
      endOffset: 11,
      type: "annotation",
      passed: true,
    }
    const tree = rootWith(textNode("hello world", 0, 11))
    run(tree, [h])
    const segs = children(tree)
    expect(segs).toHaveLength(2)
    expect(segs[0]?.children?.[0]?.value).toBe("hello ")
    expect(segs[1]?.children?.[0]?.value).toBe("world")
    expect(props(segs[1])["data-annotated-text"]).toBe(true)
  })

  it("handles highlight that starts at beginning of text", () => {
    const h: HighlightRange = {
      messageIndex: 0,
      partIndex: 0,
      startOffset: 0,
      endOffset: 5,
      type: "annotation",
      passed: false,
    }
    const tree = rootWith(textNode("hello world", 0, 11))
    run(tree, [h])
    const segs = children(tree)
    expect(segs).toHaveLength(2)
    expect(segs[0]?.children?.[0]?.value).toBe("hello")
    expect(segs[1]?.children?.[0]?.value).toBe(" world")
  })

  it("handles highlight that covers entire text", () => {
    const h: HighlightRange = {
      messageIndex: 0,
      partIndex: 0,
      startOffset: 0,
      endOffset: 11,
      type: "annotation",
      passed: true,
    }
    const tree = rootWith(textNode("hello world", 0, 11))
    run(tree, [h])
    expect(children(tree)).toHaveLength(1)
    expect(props(children(tree)[0])["data-annotated-text"]).toBe(true)
  })

  it("handles two adjacent non-overlapping highlights", () => {
    const h1: HighlightRange = {
      messageIndex: 0,
      partIndex: 0,
      startOffset: 0,
      endOffset: 5,
      type: "annotation",
      passed: true,
    }
    const h2: HighlightRange = {
      messageIndex: 0,
      partIndex: 0,
      startOffset: 6,
      endOffset: 11,
      type: "annotation",
      passed: false,
    }
    const tree = rootWith(textNode("hello world", 0, 11))
    run(tree, [h1, h2])
    const segs = children(tree)
    // "hello", " ", "world"
    expect(segs).toHaveLength(3)
    expect(props(segs[0])["data-annotated-text"]).toBe(true)
    expect(props(segs[1])["data-annotated-text"]).toBeUndefined()
    expect(props(segs[2])["data-annotated-text"]).toBe(true)
  })

  it("ignores highlights that do not overlap the text node range", () => {
    const h: HighlightRange = { messageIndex: 0, partIndex: 0, startOffset: 20, endOffset: 30, type: "annotation" }
    const tree = rootWith(textNode("hello world", 0, 11))
    run(tree, [h])
    // No highlight overlap → single plain span
    const segs = children(tree)
    expect(segs).toHaveLength(1)
    expect(props(segs[0])["data-annotated-text"]).toBeUndefined()
  })

  it("handles a highlight that partially overlaps the start of the text node", () => {
    // text: "world" at offsets 6-11, highlight: 0-8 (overlaps first 2 chars "wo")
    const h: HighlightRange = {
      messageIndex: 0,
      partIndex: 0,
      startOffset: 0,
      endOffset: 8,
      type: "annotation",
      passed: true,
    }
    const tree = rootWith(textNode("world", 6, 11))
    run(tree, [h])
    const segs = children(tree)
    expect(segs[0]?.children?.[0]?.value).toBe("wo")
    expect(props(segs[0])["data-annotated-text"]).toBe(true)
    expect(segs[1]?.children?.[0]?.value).toBe("rld")
    expect(props(segs[1])["data-annotated-text"]).toBeUndefined()
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Null / undefined safety
// ──────────────────────────────────────────────────────────────────────────────

describe("null / undefined safety", () => {
  it("does nothing when tree is falsy", () => {
    // Should not throw
    expect(() => sourceMappedTextPlugin([])()(null as unknown as HastNode)).not.toThrow()
  })

  it("handles a node with no children gracefully", () => {
    const tree: HastNode = { type: "root" }
    expect(() => run(tree)).not.toThrow()
  })

  it("handles a node with empty children array", () => {
    const tree: HastNode = { type: "root", children: [] }
    expect(() => run(tree)).not.toThrow()
    expect(children(tree)).toHaveLength(0)
  })
})
