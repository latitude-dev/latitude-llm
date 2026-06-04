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
  // Slice-relative offset of the code content start (indexOf on the slice
  // ReactMarkdown received, so NOT a full-part offset when sliceSourceStart > 0).
  sliceStart: number
  // Shared mutable counter; mutations propagate across nested span visits.
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

        // For <code> elements annotated by remarkCodeContentPositions, set up a
        // code context so nested text nodes (possibly tokenised by rehype-highlight)
        // get source offsets via character counting instead of remark positions.
        let childCodeCtx: CodeContext | undefined = codeCtx
        if (!codeCtx && node.tagName === "code") {
          const rawStart = node.properties?.["data-code-content-start"]
          const sliceStart = rawStart != null ? Number(rawStart) : NaN
          if (!Number.isNaN(sliceStart)) {
            childCodeCtx = { sliceStart, charOffset: { value: 0 } }
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
            if (value.length > 0) {
              const sliceRelStart = childCodeCtx.sliceStart + childCodeCtx.charOffset.value
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
