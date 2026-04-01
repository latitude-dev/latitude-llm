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
            const className = cn({
              "cursor-pointer inline": !!activeHighlight?.onClick,
              "bg-yellow-100 border-b-2 border-yellow-300 dark:bg-yellow-400/20 dark:border-yellow-400/50":
                activeHighlight?.type === "selection",
              "bg-red-100 dark:bg-red-400/30":
                activeHighlight?.type !== "selection" && activeHighlight?.passed === false,
              "bg-emerald-100 dark:bg-emerald-400/30":
                activeHighlight?.type !== "selection" && activeHighlight?.passed === true,
              "bg-blue-100 dark:bg-blue-400/30":
                activeHighlight?.type !== "selection" && activeHighlight?.passed === undefined && !!activeHighlight,
            })

            nextChildren.push({
              type: "element",
              tagName: activeHighlight?.onClick ? "button" : "span",
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
                ...(activeHighlight?.onClick
                  ? {
                      type: "button",
                      onClick: (e: MouseEvent) => {
                        const target = e.currentTarget as HTMLElement
                        const annotationId = target.getAttribute("data-annotation-id")
                        let left = e.clientX
                        let bottom = e.clientY
                        if (annotationId) {
                          const partRoot = target.closest("[data-part-index]") ?? document.body
                          const segments = partRoot.querySelectorAll(`[data-annotation-id="${annotationId}"]`)
                          if (segments.length > 0) {
                            let minLeft = Number.POSITIVE_INFINITY
                            let maxBottom = Number.NEGATIVE_INFINITY
                            for (const seg of segments) {
                              const r = seg.getBoundingClientRect()
                              if (r.left < minLeft) minLeft = r.left
                              if (r.bottom > maxBottom) maxBottom = r.bottom
                            }
                            left = minLeft
                            bottom = maxBottom
                          }
                        }
                        activeHighlight.onClick?.({ x: left, y: bottom })
                      },
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
