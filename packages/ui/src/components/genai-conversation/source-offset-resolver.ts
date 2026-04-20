import type { GenAIMessage } from "rosetta-ai"

export interface TextSelectionAnchor {
  messageIndex: number
  partIndex: number
  startOffset: number
  endOffset: number
  selectedText: string
}

export function getPartText(
  messages: readonly (GenAIMessage | null)[],
  messageIndex: number,
  partIndex: number,
): string | null {
  const msg = messages[messageIndex]
  if (!msg) return null

  let parts = msg.parts
  if (!parts || parts.length === 0) {
    const content = (msg as { content?: string }).content
    if (typeof content === "string") {
      parts = [{ type: "text" as const, content }]
    } else {
      return null
    }
  }

  const part = parts[partIndex]
  if (!part) return null

  if (part.type === "text" || part.type === "reasoning") {
    return (part as { content: string }).content ?? null
  }
  return null
}

export function findIndices(node: Node) {
  let el: HTMLElement | null = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement)

  let messageIndex: number | null = null
  let partIndex: number | null = null
  let contentType: string | null = null

  // Read `data-content-type` from the part-wrapper element only (the one that
  // carries `data-part-index`). Nested renderers inside a part can legitimately
  // set their own `data-content-type` (e.g. JsonContent marks its <pre> as
  // "json" for styling/testing), and an inside-out walk would otherwise latch
  // onto the inner marker and misreport the part's content type.
  while (el) {
    if (messageIndex === null) {
      const v = el.getAttribute("data-message-index")
      if (v !== null) messageIndex = parseInt(v, 10)
    }
    if (partIndex === null) {
      const v = el.getAttribute("data-part-index")
      if (v !== null) {
        partIndex = parseInt(v, 10)
        const ct = el.getAttribute("data-content-type")
        if (ct) contentType = ct
      }
    }
    if (messageIndex !== null && partIndex !== null) break
    el = el.parentElement
  }

  if (messageIndex !== null && partIndex !== null) {
    return { messageIndex, partIndex, contentType: contentType ?? "text" }
  }
  return null
}

function findPartRoot(node: Node): HTMLElement | null {
  let el: HTMLElement | null = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement)
  while (el) {
    if (el.getAttribute("data-part-index") !== null) return el
    el = el.parentElement
  }
  return null
}

function collectTextNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
  let n = walker.nextNode()
  while (n) {
    if (n.textContent) nodes.push(n as Text)
    n = walker.nextNode()
  }
  return nodes
}

function getSourceOffsetsFromNode(node: Node): { start: number; end: number } | null {
  let el: HTMLElement | null = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement)

  while (el && el.getAttribute("data-part-index") === null) {
    const start = el.getAttribute("data-source-start")
    const end = el.getAttribute("data-source-end")
    if (start !== null && end !== null) {
      const startNum = parseInt(start, 10)
      const endNum = parseInt(end, 10)
      if (!Number.isNaN(startNum) && !Number.isNaN(endNum) && endNum >= startNum) {
        return { start: startNum, end: endNum }
      }
    }
    el = el.parentElement
  }
  return null
}

interface MappedTextNode {
  node: Text
  domStart: number
  domEnd: number
  sourceStart: number
  sourceEnd: number
}

function buildPositionMap(textNodes: Text[]): { map: MappedTextNode[]; totalDomLength: number } {
  const map: MappedTextNode[] = []
  let domOffset = 0
  for (const node of textNodes) {
    const len = node.textContent?.length ?? 0
    const source = getSourceOffsetsFromNode(node)
    if (source && len > 0) {
      map.push({
        node,
        domStart: domOffset,
        domEnd: domOffset + len,
        sourceStart: source.start,
        sourceEnd: source.end,
      })
    }
    domOffset += len
  }
  return { map, totalDomLength: domOffset }
}

function resolveDomOffset(textNodes: Text[], container: Node, offset: number, side: "start" | "end"): number {
  if (container.nodeType === Node.TEXT_NODE) {
    let acc = 0
    for (const tn of textNodes) {
      if (tn === container) return acc + offset
      acc += tn.textContent?.length ?? 0
    }
    return -1
  }

  const children = container.childNodes
  if (side === "start") {
    for (let i = offset; i < children.length; i++) {
      const result = domOffsetOfFirstMatch(textNodes, children[i])
      if (result >= 0) return result
    }
    for (let i = offset - 1; i >= 0; i--) {
      const result = domOffsetOfLastMatch(textNodes, children[i])
      if (result >= 0) return result
    }
  } else {
    for (let i = offset - 1; i >= 0; i--) {
      const result = domOffsetOfLastMatch(textNodes, children[i])
      if (result >= 0) return result
    }
    for (let i = textNodes.length - 1; i >= 0; i--) {
      const tn = textNodes[i]
      if (tn && container.contains(tn)) {
        return domOffsetOf(textNodes, tn, tn.textContent?.length ?? 0)
      }
    }
  }
  return -1
}

function domOffsetOf(textNodes: Text[], target: Text, charOffset: number): number {
  let acc = 0
  for (const tn of textNodes) {
    if (tn === target) return acc + charOffset
    acc += tn.textContent?.length ?? 0
  }
  return -1
}

function domOffsetOfFirstMatch(textNodes: Text[], root: Node | null | undefined): number {
  if (!root) return -1
  if (root.nodeType === Node.TEXT_NODE) return domOffsetOf(textNodes, root as Text, 0)
  if (root.nodeType !== Node.ELEMENT_NODE) return -1
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
  let n = walker.nextNode()
  while (n) {
    const result = domOffsetOf(textNodes, n as Text, 0)
    if (result >= 0) return result
    n = walker.nextNode()
  }
  return -1
}

function domOffsetOfLastMatch(textNodes: Text[], root: Node | null | undefined): number {
  if (!root) return -1
  if (root.nodeType === Node.TEXT_NODE) return domOffsetOf(textNodes, root as Text, root.textContent?.length ?? 0)
  if (root.nodeType !== Node.ELEMENT_NODE) return -1
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
  let last: Text | null = null
  let n = walker.nextNode()
  while (n) {
    if (domOffsetOf(textNodes, n as Text, 0) >= 0) last = n as Text
    n = walker.nextNode()
  }
  if (!last) return -1
  return domOffsetOf(textNodes, last, last.textContent?.length ?? 0)
}

function domToSource(domPos: number, map: MappedTextNode[], side: "start" | "end"): number {
  for (const entry of map) {
    if (domPos >= entry.domStart && domPos <= entry.domEnd) {
      const domLen = entry.domEnd - entry.domStart
      const sourceLen = entry.sourceEnd - entry.sourceStart
      if (domLen === 0) return entry.sourceStart
      const ratio = (domPos - entry.domStart) / domLen
      return Math.round(entry.sourceStart + ratio * sourceLen)
    }
  }

  if (side === "start") {
    for (const entry of map) {
      if (entry.domStart >= domPos) return entry.sourceStart
    }
    const last = map[map.length - 1]
    return last ? last.sourceEnd : -1
  }

  for (let i = map.length - 1; i >= 0; i--) {
    const entry = map[i]
    if (entry && entry.domEnd <= domPos) return entry.sourceEnd
  }
  const first = map[0]
  return first ? first.sourceStart : -1
}

/**
 * Strip markdown syntax and collapse whitespace so rendered DOM text
 * and markdown source can be compared by length.
 */
function normalizeRendered(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "") // heading markers
    .replace(/\*{1,3}|_{1,3}/g, "") // bold/italic markers
    .replace(/`{1,3}/g, "") // inline code / code fence markers
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images → alt
    .replace(/\s+/g, " ") // collapse whitespace
    .trim()
}

function calculateTextOffsets(
  textNodes: Text[],
  range: Range,
  fullText: string,
): { textStart: number; textEnd: number } | null {
  const selectedText = range.toString()
  if (!selectedText.trim()) return null

  const { map } = buildPositionMap(textNodes)
  if (map.length === 0) return null

  const domStart = resolveDomOffset(textNodes, range.startContainer, range.startOffset, "start")
  const domEnd = resolveDomOffset(textNodes, range.endContainer, range.endOffset, "end")
  if (domStart < 0 || domEnd < 0 || domEnd <= domStart) return null

  const textStart = domToSource(domStart, map, "start")
  let textEnd = domToSource(domEnd, map, "end")

  if (textStart < 0 || textEnd < 0 || textEnd <= textStart || textEnd > fullText.length) return null

  // Clamp the resolved range to match what the user visually selected.
  //
  // When the user drags into whitespace between block elements (e.g. between
  // a <p> and an <h2>) the DOM range end can snap to the start of the next
  // block, causing the resolved source range to include content beyond the
  // actual selection. The rendered DOM text (via range.toString()) is our
  // ground truth: strip markdown syntax from both and compare.
  const trimmedSelected = normalizeRendered(selectedText)
  const resolvedSource = fullText.slice(textStart, textEnd)
  const normalizedSource = normalizeRendered(resolvedSource)

  if (normalizedSource.length > trimmedSelected.length && trimmedSelected.length > 0) {
    // The resolved range overshoots. Find the last blank-line boundary
    // (\n\n) in the source and try cutting there — block elements in
    // markdown are separated by blank lines.
    const sourceSlice = fullText.slice(textStart, textEnd)
    let cutIdx = sourceSlice.lastIndexOf("\n\n")
    while (cutIdx > 0) {
      const candidate = sourceSlice.slice(0, cutIdx)
      const norm = normalizeRendered(candidate)
      if (norm.length <= trimmedSelected.length) {
        textEnd = textStart + cutIdx
        break
      }
      cutIdx = sourceSlice.lastIndexOf("\n\n", cutIdx - 1)
    }
    // Trim trailing whitespace/newlines
    while (textEnd > textStart && /\s/.test(fullText[textEnd - 1])) {
      textEnd--
    }
  }
  if (textEnd <= textStart) return null

  return { textStart, textEnd }
}

/**
 * Phase 2: resolve a DOM Range to markdown source offsets.
 * Only called when the user commits an action (Copy / Annotate).
 */
export function resolveSourceOffsets(
  range: Range,
  messages: readonly (GenAIMessage | null)[],
  messageIndex: number,
  partIndex: number,
): TextSelectionAnchor | null {
  const fullText = getPartText(messages, messageIndex, partIndex)
  if (!fullText) return null

  const partRoot = findPartRoot(range.startContainer) ?? findPartRoot(range.endContainer)
  if (!partRoot) return null

  const textNodes = collectTextNodes(partRoot)
  const offsets = calculateTextOffsets(textNodes, range, fullText)
  if (!offsets) return null

  return {
    messageIndex,
    partIndex,
    startOffset: offsets.textStart,
    endOffset: offsets.textEnd,
    selectedText: range.toString().trim(),
  }
}
