import type { Break, Root, Text } from "mdast"
import { SKIP, visit } from "unist-util-visit"

interface Segment {
  value: string
  start: number
  end: number
}

function splitOnLineEndings(text: string): Segment[] {
  const segments: Segment[] = []
  const pattern = /\r\n|\r|\n/g
  let last = 0
  let match = pattern.exec(text)
  while (match) {
    segments.push({ value: text.slice(last, match.index), start: last, end: match.index })
    last = match.index + match[0].length
    match = pattern.exec(text)
  }
  segments.push({ value: text.slice(last), start: last, end: text.length })
  return segments
}

function splitTextNode(node: Text, source: string): (Text | Break)[] | null {
  const parts = splitOnLineEndings(node.value)
  if (parts.length === 1) return null

  const start = node.position?.start
  const startOffset = start?.offset
  const endOffset = node.position?.end?.offset
  const sourceParts =
    startOffset != null && endOffset != null ? splitOnLineEndings(source.slice(startOffset, endOffset)) : null
  // Markdown escapes and character references make `value` shorter than its
  // source span, so offsets are only trustworthy when both sides split the
  // same number of times.
  const aligned = sourceParts?.length === parts.length ? sourceParts : null

  const replacements: (Text | Break)[] = []
  parts.forEach((part, index) => {
    if (index > 0) replacements.push({ type: "break" })
    if (!part.value) return

    const text: Text = { type: "text", value: part.value }
    const sourcePart = aligned?.[index]
    if (sourcePart && start && startOffset != null) {
      const line = start.line + index
      const column = index === 0 ? start.column : 1
      text.position = {
        start: { line, column, offset: startOffset + sourcePart.start },
        end: { line, column: column + sourcePart.value.length, offset: startOffset + sourcePart.end },
      }
    }
    replacements.push(text)
  })

  return replacements
}

/**
 * Drop-in for `remark-breaks` that keeps `position` on the split text nodes.
 * Upstream rebuilds them through `mdast-util-find-and-replace`, which emits
 * position-less nodes, and the rehype source mapper can only stamp
 * `data-source-*` on positioned text — so every paragraph written with soft
 * line breaks would silently lose annotation and search-highlight anchoring.
 */
export function remarkSourceMappedBreaks() {
  return (tree: Root, file: unknown) => {
    const source = String(file)

    visit(tree, "text", (node: Text, index, parent) => {
      if (!parent || index == null) return
      const replacements = splitTextNode(node, source)
      if (!replacements) return

      parent.children.splice(index, 1, ...replacements)
      return [SKIP, index + replacements.length]
    })
  }
}
