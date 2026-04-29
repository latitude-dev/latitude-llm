/**
 * Tiny purpose-built JSON line-diff for `--dry-run` output. Renders changes
 * to `openclaw.json` in a human-readable unified-diff-ish format without
 * pulling in a real diff library (zero new deps).
 *
 * The shape of `openclaw.json` is small (a few hundred lines tops, with
 * stable key ordering after our edits), so the naive line-by-line approach
 * produces a perfectly readable output. We mark added lines with `+ ` and
 * removed lines with `- `, with a few lines of context around each change.
 */
const CONTEXT_LINES = 3

interface DiffOptions {
  /** Header label for the "before" side (default: `current`). */
  fromLabel?: string
  /** Header label for the "after" side (default: `proposed`). */
  toLabel?: string
}

/**
 * Render a unified-ish diff between two unknown JSON values. Returns an
 * empty string if they're identical after normalization.
 */
export function jsonDiff(before: unknown, after: unknown, opts: DiffOptions = {}): string {
  const fromLabel = opts.fromLabel ?? "current"
  const toLabel = opts.toLabel ?? "proposed"

  const beforeJson = `${JSON.stringify(before ?? {}, null, 2)}\n`
  const afterJson = `${JSON.stringify(after ?? {}, null, 2)}\n`

  if (beforeJson === afterJson) return ""

  const beforeLines = beforeJson.split("\n")
  const afterLines = afterJson.split("\n")

  // Compute LCS-driven minimal edit script. For files of this size the
  // O(n*m) DP is fine — `openclaw.json` rarely exceeds a few hundred lines.
  const ops = lcsDiff(beforeLines, afterLines)

  const out: string[] = []
  out.push(`--- ${fromLabel}`)
  out.push(`+++ ${toLabel}`)

  // Render hunks (groups of contiguous changes + their context).
  let i = 0
  while (i < ops.length) {
    if (ops[i]?.kind === "eq") {
      i++
      continue
    }
    // Found a change — collect the surrounding hunk.
    const hunkStart = Math.max(0, i - CONTEXT_LINES)
    let hunkEnd = i
    while (hunkEnd < ops.length) {
      if (ops[hunkEnd]?.kind === "eq") {
        // Stop the hunk after CONTEXT_LINES of equality, unless the very
        // next non-equal op is within CONTEXT_LINES * 2 (then we collapse
        // adjacent change blocks into one hunk).
        let runOfEq = 0
        let k = hunkEnd
        while (k < ops.length && ops[k]?.kind === "eq" && runOfEq < CONTEXT_LINES * 2) {
          runOfEq++
          k++
        }
        if (k >= ops.length || ops[k]?.kind === "eq") {
          hunkEnd = Math.min(hunkEnd + CONTEXT_LINES, ops.length)
          break
        }
        hunkEnd = k
        continue
      }
      hunkEnd++
    }

    for (let j = hunkStart; j < hunkEnd && j < ops.length; j++) {
      const op = ops[j]
      if (!op) continue
      if (op.kind === "eq") out.push(`  ${op.line}`)
      else if (op.kind === "add") out.push(`+ ${op.line}`)
      else if (op.kind === "del") out.push(`- ${op.line}`)
    }
    i = hunkEnd
  }

  return out.join("\n")
}

type Op = { kind: "eq"; line: string } | { kind: "add"; line: string } | { kind: "del"; line: string }

function lcsDiff(a: readonly string[], b: readonly string[]): Op[] {
  const n = a.length
  const m = b.length
  // dp[i][j] = LCS length of a[0..i) and b[0..j)
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = (dp[i - 1]?.[j - 1] ?? 0) + 1
      } else {
        dp[i]![j] = Math.max(dp[i - 1]?.[j] ?? 0, dp[i]?.[j - 1] ?? 0)
      }
    }
  }
  // Walk back to produce the edit script.
  const ops: Op[] = []
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      ops.push({ kind: "eq", line: a[i - 1] as string })
      i--
      j--
    } else if ((dp[i - 1]?.[j] ?? 0) >= (dp[i]?.[j - 1] ?? 0)) {
      ops.push({ kind: "del", line: a[i - 1] as string })
      i--
    } else {
      ops.push({ kind: "add", line: b[j - 1] as string })
      j--
    }
  }
  while (i > 0) {
    ops.push({ kind: "del", line: a[i - 1] as string })
    i--
  }
  while (j > 0) {
    ops.push({ kind: "add", line: b[j - 1] as string })
    j--
  }
  ops.reverse()
  return ops
}
