// Attaches `data-code-content-start` / `data-code-content-end` onto HAST
// <code> elements so that sourceMappedTextPlugin can map code-block text back
// to source offsets via character counting.
//
// Background: remark-to-hast does not propagate source positions to text
// nodes inside code fences, so sourceMappedTextPlugin cannot use its normal
// position-based approach there. This plugin fills the gap by searching for
// the code node's value verbatim in the markdown source and recording the
// exact byte range where the content lives.

function visitCode(node: any, callback: (node: any) => void): void {
  if (!node) return
  if (node.type === "code") callback(node)
  if (Array.isArray(node.children)) {
    for (const child of node.children) visitCode(child, callback)
  }
}

export function remarkCodeContentPositions() {
  return function (tree: any, file: any) {
    const source: string = String(file)
    if (!source) return

    visitCode(tree, (node) => {
      if (!node.position || typeof node.value !== "string" || node.value === "") return

      const fenceStart: number | undefined = node.position.start?.offset
      const fenceEnd: number | undefined = node.position.end?.offset
      if (fenceStart == null || fenceEnd == null) return

      // Skip past the opening fence line (contains ``` and optional lang)
      // to avoid false matches against the language identifier.
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
