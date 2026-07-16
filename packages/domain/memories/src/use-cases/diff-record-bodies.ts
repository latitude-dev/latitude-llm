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
 * remove.
 */
const diffRecordBodies = (before: string | null, after: string | null): BodyDiffResult => {
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

interface RecordTokenDelta {
  readonly tokensAdded: number
  readonly tokensRemoved: number
  readonly degraded: boolean
}

/**
 * Token delta for one record change. Line-diffs the bodies when both needed
 * sides are present; otherwise degrades to the record-level `tokenCount`
 * ([D5]) — a body is unavailable on content opt-out (`hash === ""`) or when its
 * blob has been pruned (`body === null`). Shared by the manifest diff and the
 * session/trace write summary.
 */
export const recordTokenDelta = (input: {
  readonly kind: "added" | "updated" | "removed"
  readonly beforeHash: string
  readonly afterHash: string
  readonly beforeBody: string | null
  readonly afterBody: string | null
  readonly beforeTokens: number
  readonly afterTokens: number
}): RecordTokenDelta => {
  const { kind, beforeHash, afterHash, beforeBody, afterBody, beforeTokens, afterTokens } = input
  const beforeMissing = beforeHash !== "" && beforeBody === null
  const afterMissing = afterHash !== "" && afterBody === null
  const degraded =
    kind === "added"
      ? afterHash === "" || afterMissing
      : kind === "removed"
        ? beforeHash === "" || beforeMissing
        : beforeHash === "" || beforeMissing || afterHash === "" || afterMissing

  if (degraded) {
    return {
      tokensAdded: kind === "removed" ? 0 : afterTokens,
      tokensRemoved: kind === "added" ? 0 : beforeTokens,
      degraded: true,
    }
  }
  const { tokensAdded, tokensRemoved } = diffRecordBodies(beforeBody, afterBody)
  return { tokensAdded, tokensRemoved, degraded: false }
}
