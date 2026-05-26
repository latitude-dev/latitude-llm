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

      const visit = (node: HastNode | undefined) => {
        if (!node) return
        const children = node.children
        if (!children || children.length === 0) return

        const nextChildren: HastNode[] = []

        for (const child of children) {
          if (!child) continue
          if (child.type !== "text") {
            visit(child)
            nextChildren.push(child)
            continue
          }

          const value = child.value ?? ""
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
