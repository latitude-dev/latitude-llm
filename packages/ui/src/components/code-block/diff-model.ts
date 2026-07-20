import { type Change, diffLines, diffWordsWithSpace } from "diff"

export type DiffRowKind = "context" | "add" | "remove"

export interface DiffRow {
  readonly kind: DiffRowKind
  /** Line number in the "before" body, or null for added lines. */
  readonly oldLineNumber: number | null
  /** Line number in the "after" body, or null for removed lines. */
  readonly newLineNumber: number | null
  readonly text: string
  /** `[from, to)` char ranges within `text` that changed at word level, for intra-line emphasis. */
  readonly emphases: ReadonlyArray<readonly [number, number]>
}

interface OffsetLine {
  readonly text: string
  readonly start: number
}

/** Split into lines keeping each line's start offset; a trailing newline does not yield an extra empty line. */
function splitOffsetLines(text: string): OffsetLine[] {
  const lines: OffsetLine[] = []
  let start = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      lines.push({ text: text.slice(start, i), start })
      start = i + 1
    }
  }
  if (start < text.length) {
    lines.push({ text: text.slice(start), start })
  } else if (text.length === 0) {
    lines.push({ text: "", start: 0 })
  }
  return lines
}

/** Reconstruct one side of a word diff, marking the ranges that belong only to that side. */
function collectSide(
  wordParts: Change[],
  side: "removed" | "added",
): { text: string; emphases: Array<[number, number]> } {
  let text = ""
  const emphases: Array<[number, number]> = []
  for (const part of wordParts) {
    const belongsToOther = side === "removed" ? part.added : part.removed
    if (belongsToOther) continue
    const changed = side === "removed" ? part.removed : part.added
    const start = text.length
    text += part.value
    if (changed) emphases.push([start, text.length])
  }
  return { text, emphases }
}

function clampEmphases(
  lineStart: number,
  lineLength: number,
  ranges: ReadonlyArray<readonly [number, number]>,
): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (const [start, end] of ranges) {
    const from = Math.max(start, lineStart) - lineStart
    const to = Math.min(end, lineStart + lineLength) - lineStart
    if (to > from) out.push([from, to])
  }
  return out
}

// Word-level diffing is ~O(n²); skip it for very large paired blocks (a full-body
// replacement) so it can't block the render thread — those fall back to line-level.
const WORD_DIFF_MAX_LEN = 20_000

/**
 * Compute a GitHub-style unified diff row model. Removed lines carry their
 * before-file line number, added lines their after-file line number, and
 * context lines carry both — so gutters stay accurate across a hunk. Adjacent
 * remove/add blocks get word-level `emphases` so intra-line changes can be
 * highlighted without repainting the whole line.
 */
export function computeDiffRows(before: string, after: string): DiffRow[] {
  const parts = diffLines(before, after)
  const rows: DiffRow[] = []
  let oldLine = 1
  let newLine = 1

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!
    if (!part.added && !part.removed) {
      for (const line of splitOffsetLines(part.value)) {
        rows.push({
          kind: "context",
          oldLineNumber: oldLine++,
          newLineNumber: newLine++,
          text: line.text,
          emphases: [],
        })
      }
      continue
    }

    const next = parts[i + 1]
    if (part.removed && next?.added && part.value.length + next.value.length <= WORD_DIFF_MAX_LEN) {
      const wordParts = diffWordsWithSpace(part.value, next.value)
      const removed = collectSide(wordParts, "removed")
      const added = collectSide(wordParts, "added")
      for (const line of splitOffsetLines(removed.text)) {
        rows.push({
          kind: "remove",
          oldLineNumber: oldLine++,
          newLineNumber: null,
          text: line.text,
          emphases: clampEmphases(line.start, line.text.length, removed.emphases),
        })
      }
      for (const line of splitOffsetLines(added.text)) {
        rows.push({
          kind: "add",
          oldLineNumber: null,
          newLineNumber: newLine++,
          text: line.text,
          emphases: clampEmphases(line.start, line.text.length, added.emphases),
        })
      }
      i++
      continue
    }

    if (part.removed) {
      for (const line of splitOffsetLines(part.value)) {
        rows.push({ kind: "remove", oldLineNumber: oldLine++, newLineNumber: null, text: line.text, emphases: [] })
      }
      continue
    }

    for (const line of splitOffsetLines(part.value)) {
      rows.push({ kind: "add", oldLineNumber: null, newLineNumber: newLine++, text: line.text, emphases: [] })
    }
  }

  return rows
}
