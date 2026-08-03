import { REDACTION_PLACEHOLDER_PATTERN } from "./redaction-placeholders.ts"
import type { HastNode } from "./source-mapped-text-plugin.ts"

/** `<mark>` because nothing else in this pipeline emits one, so intercepting it is unambiguous. */
export const REDACTION_CHIP_TAG = "mark"
export const REDACTION_CHIP_LABEL_ATTR = "data-redaction-label"

/**
 * Turns `[REDACTED_<LABEL>]` in prose into a `<mark>` the renderer swaps for a chip.
 *
 * Must run BEFORE `sourceMappedTextPlugin`. That plugin turns each text node into
 * offset-carrying spans, and splitting one afterwards would leave a span claiming a
 * source range wider than its own text — which is what selection-to-annotation
 * mapping reads.
 */
export function rehypeRedactionChips() {
  return function transformer(tree: HastNode) {
    if (!tree) return
    visit(tree, false)
  }
}

const visit = (node: HastNode | undefined, insideCode: boolean) => {
  if (!node) return
  const children = node.children
  if (!children || children.length === 0) return

  // Inside a code element `sourceMappedTextPlugin` tracks position with a running
  // character count that only advances on text nodes, so a chip there would silently
  // shift every later highlight in the block. A literal placeholder is also the more
  // useful thing to show in a payload someone is about to copy.
  const childInsideCode = insideCode || node.tagName === "code" || node.tagName === "pre"

  const nextChildren: HastNode[] = []
  let changed = false

  for (const child of children) {
    if (!child) continue
    if (child.type !== "text") {
      visit(child, childInsideCode)
      nextChildren.push(child)
      continue
    }

    const value = child.value ?? ""
    if (childInsideCode || value.length === 0) {
      nextChildren.push(child)
      continue
    }

    const split = splitOnPlaceholders(value, child.position?.start?.offset)
    if (split === null) {
      nextChildren.push(child)
      continue
    }

    changed = true
    nextChildren.push(...split)
  }

  if (changed) node.children = nextChildren
}

/** `null` when the text holds no placeholder, so the caller can keep the original node. */
const splitOnPlaceholders = (value: string, startOffset: number | undefined): HastNode[] | null => {
  REDACTION_PLACEHOLDER_PATTERN.lastIndex = 0
  const matches = [...value.matchAll(REDACTION_PLACEHOLDER_PATTERN)]
  if (matches.length === 0) return null

  const nodes: HastNode[] = []
  let cursor = 0

  for (const match of matches) {
    const index = match.index ?? 0
    const label = match[1]
    if (label === undefined) continue

    if (index > cursor) nodes.push(textNode(value.slice(cursor, index), startOffset, cursor, index))

    // No `position` on the chip: `sourceMappedTextPlugin` passes position-less nodes
    // through unwrapped, which correctly makes a placeholder unselectable for
    // annotation and invisible to search highlighting.
    nodes.push({
      type: "element",
      tagName: REDACTION_CHIP_TAG,
      properties: { [REDACTION_CHIP_LABEL_ATTR]: label },
      children: [],
    })

    cursor = index + match[0].length
  }

  if (cursor < value.length) nodes.push(textNode(value.slice(cursor), startOffset, cursor, value.length))

  return nodes
}

const textNode = (value: string, startOffset: number | undefined, from: number, to: number): HastNode =>
  startOffset === undefined
    ? { type: "text", value }
    : {
        type: "text",
        value,
        position: { start: { offset: startOffset + from }, end: { offset: startOffset + to } },
      }
