// Attaches `data-code-content-start/end` to HAST <code> elements so that
// sourceMappedTextPlugin can map code-block text to source offsets.
// remark-to-hast doesn't propagate positions for code-fence text nodes, so we
// find the content verbatim in the source string and store the character range.

function visitCode(node: any, callback: (node: any) => void): void {
  if (!node) return
  if (node.type === "code") callback(node)
  if (Array.isArray(node.children)) {
    for (const child of node.children) visitCode(child, callback)
  }
}

export function remarkCodeContentPositions() {
  return (tree: any, file: any) => {
    const source: string = String(file)
    if (!source) return

    visitCode(tree, (node) => {
      if (!node.position || typeof node.value !== "string" || node.value === "") return

      const fenceStart: number | undefined = node.position.start?.offset
      const fenceEnd: number | undefined = node.position.end?.offset
      if (fenceStart == null || fenceEnd == null) return

      // Start search after the opening fence line to avoid matching the lang id.
      const firstNewline = source.indexOf("\n", fenceStart)
      if (firstNewline < 0 || firstNewline >= fenceEnd) return
      const searchFrom = firstNewline + 1

      const content: string = node.value
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
