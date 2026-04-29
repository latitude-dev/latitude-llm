/**
 * Apply a list of literal find/replace edits to a source string.
 *
 * Semantics — read these before changing anything:
 *
 *   1. Sequential application. Edit `n` runs against the result of edit
 *      `n-1`. This lets the proposer chain related changes (split a fn,
 *      then tweak the new fn body) and matches how a human reads a patch
 *      list top-to-bottom.
 *
 *   2. Literal matching. `find` is matched verbatim with `indexOf` — no
 *      regex, no wildcards. The model is responsible for picking enough
 *      surrounding context to make `find` unique. We `String.replaceAll`-
 *      style use slice + concat to avoid `String.replace`'s special
 *      `$&` / `$1` / `$\`` substitutions in `replace`.
 *
 *   3. Exactly-one match required. Zero matches → MatchNotFound. Two or
 *      more → AmbiguousMatch. Both surface a clear failure that the
 *      proposer can learn from on the next round (carried via the
 *      candidate-rejected trajectory feedback path the optimizer already
 *      has wired up — no new code needed downstream).
 *
 *   4. CRLF normalization. The model occasionally emits `\r\n` line
 *      endings even when the source uses `\n` only. We normalize `find`
 *      and `replace` to `\n` before matching/applying, so a stray CRLF
 *      doesn't burn an iteration. The source text itself is left alone.
 */

export interface FindReplaceEdit {
  readonly find: string
  readonly replace: string
}

type ApplyEditsFailureReason =
  | { readonly kind: "match-not-found"; readonly editIndex: number; readonly findPreview: string }
  | {
      readonly kind: "ambiguous-match"
      readonly editIndex: number
      readonly occurrences: number
      readonly findPreview: string
    }

export class ApplyEditsError extends Error {
  readonly reason: ApplyEditsFailureReason

  constructor(reason: ApplyEditsFailureReason) {
    super(formatReason(reason))
    this.name = "ApplyEditsError"
    this.reason = reason
  }
}

export const applyEdits = (currentText: string, edits: readonly FindReplaceEdit[]): string => {
  let result = currentText
  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i]
    if (edit === undefined) continue
    result = applyOne(result, edit, i)
  }
  return result
}

const applyOne = (text: string, edit: FindReplaceEdit, editIndex: number): string => {
  const find = normalizeNewlines(edit.find)
  const replace = normalizeNewlines(edit.replace)

  const first = text.indexOf(find)
  if (first === -1) {
    throw new ApplyEditsError({
      kind: "match-not-found",
      editIndex,
      findPreview: previewLine(find),
    })
  }
  const second = text.indexOf(find, first + find.length)
  if (second !== -1) {
    // Count remaining occurrences for the error message — capped to keep
    // the diagnostic useful even for pathological inputs (e.g. an edit
    // matching a single empty line that occurs hundreds of times).
    let count = 2
    let scan = second
    while (scan !== -1 && count < 10) {
      scan = text.indexOf(find, scan + find.length)
      if (scan !== -1) count++
    }
    throw new ApplyEditsError({
      kind: "ambiguous-match",
      editIndex,
      occurrences: count,
      findPreview: previewLine(find),
    })
  }

  return text.slice(0, first) + replace + text.slice(first + find.length)
}

const normalizeNewlines = (s: string): string => s.replace(/\r\n/g, "\n")

// First non-empty line of the find string, trimmed and length-capped.
// Just enough context to identify which edit failed in error messages
// without flooding logs with a 30-line patch chunk.
const previewLine = (s: string): string => {
  const firstNonEmpty = s.split("\n").find((line) => line.trim().length > 0) ?? s
  const trimmed = firstNonEmpty.trim()
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed
}

const formatReason = (reason: ApplyEditsFailureReason): string => {
  switch (reason.kind) {
    case "match-not-found":
      return `edit ${reason.editIndex + 1}: find string did not match any substring (find starts with: "${reason.findPreview}")`
    case "ambiguous-match":
      return `edit ${reason.editIndex + 1}: find string matched ${reason.occurrences === 10 ? "10+" : reason.occurrences} times — add more surrounding context to disambiguate (find starts with: "${reason.findPreview}")`
  }
}
