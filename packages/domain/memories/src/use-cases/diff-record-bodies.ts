import { diffLines } from "diff"
import { countTokens } from "../entities/tokenizer.ts"

interface BodyDiffResult {
  readonly tokensAdded: number
  readonly tokensRemoved: number
}

/**
 * Token delta between two record bodies via a line diff: tokens on inserted
 * lines count as added, tokens on deleted lines as removed, unchanged lines
 * skipped. A `null` before is a whole-body add; a `null` after is a whole-body
 * remove. Shared by the manifest diff and the session/trace write summary.
 */
export const diffRecordBodies = (before: string | null, after: string | null): BodyDiffResult => {
  if (before === after) return { tokensAdded: 0, tokensRemoved: 0 }
  if (before === null) return { tokensAdded: countTokens(after ?? ""), tokensRemoved: 0 }
  if (after === null) return { tokensAdded: 0, tokensRemoved: countTokens(before) }

  let tokensAdded = 0
  let tokensRemoved = 0
  for (const change of diffLines(before, after)) {
    if (change.added) tokensAdded += countTokens(change.value)
    else if (change.removed) tokensRemoved += countTokens(change.value)
  }
  return { tokensAdded, tokensRemoved }
}
