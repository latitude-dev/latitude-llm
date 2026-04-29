import { createPatch } from "diff"
import type { Metrics } from "../../runner/metrics.ts"
import { formatPercent } from "../../ui/format.ts"

/**
 * Per-family MD body for flagger optimization runs. Plugs into
 * `report-renderer.ts` via the `bodyMarkdown` field. Sections:
 *
 *   - Per-tactic F1 deltas (if tactic tags present)
 *   - Unified diff between baseline file and winning file
 *
 * We deliberately keep this short — the iteration table and headline
 * metrics are rendered by the target-agnostic renderer; the per-family
 * report is what makes a flagger run *reviewable*: tactic-level
 * regressions and the literal diff a human will paste into a PR.
 */

interface FlaggerReportInput {
  readonly targetId: string
  readonly baselineFilePath: string
  readonly baselineFileText: string
  readonly winnerFileText: string
  readonly perTacticBaseline: Record<string, Metrics>
  readonly perTacticWinner: Record<string, Metrics>
}

export const renderFlaggerReportBody = (input: FlaggerReportInput): string => {
  const sections: string[] = []

  sections.push("## Per-tactic F1")
  sections.push("")
  const tactics = unionTactics(input.perTacticBaseline, input.perTacticWinner)
  if (tactics.length === 0) {
    sections.push("_No tactic tags in this run._")
  } else {
    sections.push("| Tactic | Baseline F1 | Winner F1 | Δ |")
    sections.push("|---|---:|---:|---:|")
    for (const tactic of tactics) {
      const before = input.perTacticBaseline[tactic]?.f1
      const after = input.perTacticWinner[tactic]?.f1
      sections.push(
        `| ${tactic} | ${formatF1Cell(before)} | ${formatF1Cell(after)} | ${formatDeltaCell(before, after)} |`,
      )
    }
  }
  sections.push("")

  sections.push("## Diff (baseline → winner)")
  sections.push("")
  sections.push("```diff")
  sections.push(buildUnifiedDiff(input))
  sections.push("```")

  return sections.join("\n")
}

const unionTactics = (a: Record<string, Metrics>, b: Record<string, Metrics>): readonly string[] =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()

const formatF1Cell = (f1: number | undefined): string => {
  if (f1 === undefined || !Number.isFinite(f1)) return "n/a"
  return formatPercent(f1)
}

const formatDeltaCell = (before: number | undefined, after: number | undefined): string => {
  if (before === undefined || after === undefined || !Number.isFinite(before) || !Number.isFinite(after)) return "n/a"
  const delta = after - before
  const sign = delta >= 0 ? "+" : ""
  return `${sign}${(delta * 100).toFixed(1)}pp`
}

const buildUnifiedDiff = (input: FlaggerReportInput): string => {
  const patch = createPatch(
    input.baselineFilePath,
    input.baselineFileText.endsWith("\n") ? input.baselineFileText : `${input.baselineFileText}\n`,
    input.winnerFileText.endsWith("\n") ? input.winnerFileText : `${input.winnerFileText}\n`,
    "baseline",
    "winner",
  )
  return patch.trimEnd()
}
