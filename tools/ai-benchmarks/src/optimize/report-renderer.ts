import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { OptimizationStopReason } from "@domain/optimizations"
import type { Metrics } from "../runner/metrics.ts"
import { formatCostUsd, formatPercent } from "../ui/format.ts"
import type { IterationRecord } from "./audit-trail.ts"
import type { CostBreakdown } from "./cost-meter.ts"

/**
 * MD report shape, the document the user reviews + commits when adopting a
 * winner. Target-agnostic scaffolding (header, iteration table, cost
 * summary) is rendered here; per-family content (unified diff, per-tactic
 * F1 deltas) is plugged in via `bodyMarkdown`. See `optimize/flagger/report.ts`
 * for how flagger reports build that body.
 */
interface ReportInput {
  readonly targetId: string
  readonly startedAt: string
  readonly finishedAt: string
  readonly baselineHash: string
  readonly winnerHash: string
  readonly baselineMetrics: Metrics
  readonly winnerMetrics: Metrics
  readonly iterations: readonly IterationRecord[]
  readonly cost: CostBreakdown
  readonly budget: {
    readonly time?: number
    readonly tokens?: number
    readonly stagnation?: number
  } | null
  readonly stopReason: OptimizationStopReason | null
  readonly sampleSize: number | null
  readonly seed: number
  readonly operatorNotesUsed: boolean
  readonly bodyMarkdown: string
}

const STOP_REASON_LABEL: Record<OptimizationStopReason, string> = {
  time: "time budget reached",
  tokens: "tokens budget reached",
  stagnation: "stagnation (no improvement)",
  completed: "optimizer exhausted candidate pool",
}

const formatF1Delta = (baseline: number, winner: number): string => {
  if (!Number.isFinite(baseline) || !Number.isFinite(winner)) return "n/a"
  const delta = winner - baseline
  const sign = delta >= 0 ? "+" : ""
  return `${formatPercent(winner)} (${sign}${(delta * 100).toFixed(1)}pp vs ${formatPercent(baseline)})`
}

export const renderReport = (input: ReportInput): string => {
  const lines: string[] = []
  lines.push(`# Optimization report — ${input.targetId}`)
  lines.push("")
  lines.push(`- Started: ${input.startedAt}`)
  lines.push(`- Finished: ${input.finishedAt}`)
  lines.push(`- Baseline hash: \`${input.baselineHash.slice(0, 12)}\``)
  lines.push(`- Winner hash: \`${input.winnerHash.slice(0, 12)}\``)
  lines.push(`- Operator notes: ${input.operatorNotesUsed ? "loaded" : "(none)"}`)
  if (input.sampleSize !== null) lines.push(`- Sample size: ${input.sampleSize} (seed=${input.seed})`)
  else lines.push(`- Sample size: full fixture (seed=${input.seed})`)
  if (input.budget) {
    const time = input.budget.time !== undefined ? `${input.budget.time}s` : "∞"
    const tokens = input.budget.tokens !== undefined ? input.budget.tokens.toLocaleString() : "∞"
    const stagnation = input.budget.stagnation !== undefined ? `${input.budget.stagnation} iters` : "default"
    lines.push(`- Budget: time=${time} tokens=${tokens} stagnation=${stagnation}`)
  }
  if (input.stopReason !== null) {
    lines.push(`- Stop reason: ${STOP_REASON_LABEL[input.stopReason]}`)
  }
  lines.push("")

  lines.push("## Headline")
  lines.push("")
  lines.push(`- F1: ${formatF1Delta(input.baselineMetrics.f1, input.winnerMetrics.f1)}`)
  lines.push(`- Precision: ${formatF1Delta(input.baselineMetrics.precision, input.winnerMetrics.precision)}`)
  lines.push(`- Recall: ${formatF1Delta(input.baselineMetrics.recall, input.winnerMetrics.recall)}`)
  lines.push(
    `- Cost: ${formatCostUsd(input.cost.totalUsd)} (proposer ${formatCostUsd(input.cost.proposerUsd)} · judge ${formatCostUsd(input.cost.judgeUsd)})`,
  )
  lines.push("")

  lines.push("## Iterations")
  lines.push("")
  lines.push("| Iter | Hash | Parent | Changed | Reasoning | Rejection |")
  lines.push("|---|---|---|---|---|---|")
  for (const it of input.iterations) {
    const changed = it.changedDeclarations.length > 0 ? it.changedDeclarations.join(", ") : "(none)"
    const reasoning = (it.proposerReasoning ?? "").split("\n").join(" ").slice(0, 100)
    const rejection = it.rejection ? `${it.rejection.stage}: ${it.rejection.reason.slice(0, 80)}` : ""
    lines.push(
      `| ${it.iteration} | \`${it.childHash.slice(0, 8)}\` | \`${it.parentHash.slice(0, 8)}\` | ${escapeCell(changed)} | ${escapeCell(reasoning)} | ${escapeCell(rejection)} |`,
    )
  }
  lines.push("")

  lines.push(input.bodyMarkdown.trim())
  lines.push("")
  return lines.join("\n")
}

const escapeCell = (s: string): string => s.replace(/\|/g, "\\|").replace(/\n/g, " ")

export const writeReport = async (path: string, content: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content.endsWith("\n") ? content : `${content}\n`)
}
