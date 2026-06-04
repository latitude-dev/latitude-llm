import type { Code, Root } from "mdast"
import { visit } from "unist-util-visit"

export function remarkCodeContentPositions() {
  return (tree: Root, file: unknown) => {
    const source = String(file)
    if (!source) return

    visit(tree, "code", (node: Code) => {
      if (!node.position || node.value === "") return

      const fenceStart = node.position.start?.offset
      const fenceEnd = node.position.end?.offset
      if (fenceStart == null || fenceEnd == null) return

      // Start search after the opening fence line to avoid matching the lang id.
      const firstNewline = source.indexOf("\n", fenceStart)
      if (firstNewline < 0 || firstNewline >= fenceEnd) return
      const searchFrom = firstNewline + 1

      const content = node.value
      const contentIdx = source.indexOf(content, searchFrom)
      if (contentIdx < 0 || contentIdx >= fenceEnd) return

      node.data = node.data ?? {}
      node.data.hProperties = {
        ...(node.data.hProperties ?? {}),
        "data-code-content-start": contentIdx,
        "data-code-content-end": contentIdx + content.length,
      }
    })
  }
}
