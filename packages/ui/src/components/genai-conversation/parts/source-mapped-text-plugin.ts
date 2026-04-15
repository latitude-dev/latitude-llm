import { cn } from "../../../utils/cn.ts"
import type { HighlightRange } from "../text-selection.tsx"

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

export function sourceMappedTextPlugin(highlights: readonly HighlightRange[]) {
  const sortedHighlights = [...highlights].sort((a, b) => a.startOffset - b.startOffset)

  // unified expects a plugin: attacher() → transformer(tree).
  // A single function(tree) is treated as an attacher and invoked with no args,
  // so the transformer receives undefined as `tree`.
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

          const overlaps = sortedHighlights.filter(
            (h) => h.endOffset > start && h.startOffset < end && h.endOffset > h.startOffset,
          )

          if (overlaps.length === 0) {
            nextChildren.push({
              type: "element",
              tagName: "span",
              properties: {
                "data-source-start": String(start),
                "data-source-end": String(end),
              },
              children: [{ type: "text", value }],
            })
            continue
          }

          const cuts = new Set<number>([start, end])
          for (const h of overlaps) {
            cuts.add(Math.max(start, h.startOffset))
            cuts.add(Math.min(end, h.endOffset))
          }
          const boundaries = [...cuts].sort((a, b) => a - b)

          for (let i = 0; i < boundaries.length - 1; i++) {
            const segStart = boundaries[i] ?? start
            const segEnd = boundaries[i + 1] ?? end
            if (segEnd <= segStart) continue

            const sliceStart = segStart - start
            const sliceEnd = segEnd - start
            const segmentText = value.slice(sliceStart, sliceEnd)
            if (!segmentText) continue

            const activeHighlight = overlaps.find((h) => h.startOffset < segEnd && h.endOffset > segStart) ?? null
            const isAnnotation = activeHighlight && activeHighlight.type !== "selection"
            const isClickable = isAnnotation && !!activeHighlight.id
            const className = cn({
              "cursor-pointer hit-area-inline-y-2": isClickable,
              "bg-yellow-100 border-b-2 border-yellow-300 dark:bg-yellow-400/20 dark:border-yellow-400/50":
                activeHighlight?.type === "selection",
              "bg-red-100 dark:bg-red-400/30": isAnnotation && activeHighlight.passed === false,
              "bg-emerald-100 dark:bg-emerald-400/30": isAnnotation && activeHighlight.passed === true,
              "bg-blue-100 dark:bg-blue-400/30": isAnnotation && activeHighlight.passed === undefined,
            })

            nextChildren.push({
              type: "element",
              tagName: "span",
              properties: {
                "data-source-start": String(segStart),
                "data-source-end": String(segEnd),
                ...(activeHighlight?.type === "selection"
                  ? { "data-selected-text": true }
                  : activeHighlight
                    ? {
                        "data-annotated-text": true,
                        ...(activeHighlight.id ? { "data-annotation-id": activeHighlight.id } : {}),
                      }
                    : {}),
                ...(className ? { className } : {}),
              },
              children: [{ type: "text", value: segmentText }],
            })
          }
        }

        node.children = nextChildren
      }

      visit(tree)
    }
  }
}
