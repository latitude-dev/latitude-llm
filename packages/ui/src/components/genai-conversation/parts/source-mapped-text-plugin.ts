import type { HighlightRange } from "../text-selection.tsx"
import { highlightAttributes, segmentForHighlights } from "./highlight-segments.ts"

export type HastNode = {
  type: string
  value?: string
  children?: HastNode[]
  position?: {
    start?: { offset?: number }
    end?: { offset?: number }
  }
  tagName?: string
  properties?: Record<string, unknown>
}

// Tracks position within a code block whose text nodes lack remark positions.
interface CodeContext {
  // Absolute offset of the code content start in the full part text.
  absoluteStart: number
  // Mutable char counter shared across all recursive visits into this code block.
  charOffset: { value: number }
}

// `sliceSourceStart` shifts emitted data-source-* attrs into full-part
// coordinates so downstream lookups work the same regardless of whether
// ReactMarkdown was handed the full string or a slice (head/middle/tail).
export function sourceMappedTextPlugin(highlights: readonly HighlightRange[], sliceSourceStart = 0) {
  const sortedHighlights = highlights
    .map((h) => ({
      ...h,
      startOffset: h.startOffset - sliceSourceStart,
      endOffset: h.endOffset - sliceSourceStart,
    }))
    .sort((a, b) => a.startOffset - b.startOffset)

  // unified plugins are attacher() → transformer(tree); the extra wrap is required.
  return function rehypeSourceMappedText() {
    return function transformer(tree: HastNode) {
      if (!tree) return

      const visit = (node: HastNode | undefined, codeCtx?: CodeContext) => {
        if (!node) return
        const children = node.children
        if (!children || children.length === 0) return

        // If this is a <code> element that remarkCodeContentPositions annotated
        // with content-position data, create a code context so that text nodes
        // inside (possibly tokenised by rehype-highlight into <span> elements)
        // can be mapped back to source offsets via character counting.
        let childCodeCtx: CodeContext | undefined = codeCtx
        if (!codeCtx && node.tagName === "code") {
          const rawStart = node.properties?.["data-code-content-start"]
          const absStart = rawStart != null ? Number(rawStart) : NaN
          if (!Number.isNaN(absStart)) {
            childCodeCtx = { absoluteStart: absStart, charOffset: { value: 0 } }
          }
        }

        const nextChildren: HastNode[] = []

        for (const child of children) {
          if (!child) continue
          if (child.type !== "text") {
            visit(child, childCodeCtx)
            nextChildren.push(child)
            continue
          }

          const value = child.value ?? ""

          if (childCodeCtx) {
            // Inside a code block: derive source position via character counting.
            // charOffset is a shared mutable object so mutations are visible to
            // the caller's loop even when the text node lives inside a nested
            // <span> (e.g. after rehype-highlight tokenisation).
            if (value.length > 0) {
              const absStart = childCodeCtx.absoluteStart + childCodeCtx.charOffset.value
              const sliceRelStart = absStart - sliceSourceStart
              const sliceRelEnd = sliceRelStart + value.length
              childCodeCtx.charOffset.value += value.length

              const segments = segmentForHighlights(value, sliceRelStart, sliceRelEnd, sortedHighlights)
              for (const segment of segments) {
                const attrs = highlightAttributes(segment.activeHighlight)
                nextChildren.push({
                  type: "element",
                  tagName: "span",
                  properties: {
                    "data-source-start": String(segment.sourceStart + sliceSourceStart),
                    "data-source-end": String(segment.sourceEnd + sliceSourceStart),
                    ...attrs,
                  },
                  children: [{ type: "text", value: segment.text }],
                })
              }
            }
            // Empty text nodes inside code blocks carry no content; drop them.
            continue
          }

          const start = child.position?.start?.offset
          const end = child.position?.end?.offset

          if (value.length === 0 || start == null || end == null || end <= start) {
            nextChildren.push(child)
            continue
          }

          const segments = segmentForHighlights(value, start, end, sortedHighlights)
          for (const segment of segments) {
            const attrs = highlightAttributes(segment.activeHighlight)
            nextChildren.push({
              type: "element",
              tagName: "span",
              properties: {
                "data-source-start": String(segment.sourceStart + sliceSourceStart),
                "data-source-end": String(segment.sourceEnd + sliceSourceStart),
                ...attrs,
              },
              children: [{ type: "text", value: segment.text }],
            })
          }
        }

        node.children = nextChildren
      }

      visit(tree)
    }
  }
}
