import { Text } from "@repo/ui"
import type {
  AgentScoreExplanationRecord,
  AgentScoreRecord,
} from "../../../../../../domains/agent-score/agent-score.functions.ts"
import { formatCount, formatScore } from "./agent-score-format.ts"
import { DIMENSION_META } from "./dimension-meta.ts"
import { DimensionScoreRing, type VitalityRingSection } from "./score-ring.tsx"

export function VitalityHoverContent({
  section,
  snapshot,
  explanation,
}: {
  readonly section: VitalityRingSection
  readonly snapshot: AgentScoreRecord | null
  readonly explanation: AgentScoreExplanationRecord["explanation"]
}) {
  const overall = section === "vitality"
  const result = overall ? snapshot : snapshot?.dimensions[section]
  const meta = overall
    ? { title: "Agent vitality", description: "Overall health across all five dimensions." }
    : DIMENSION_META[section]
  const coverage = explanation?.coverage
  const sessionCounts = coverage
    ? {
        outcome: coverage.outcomeExaminedSessions,
        reliability: coverage.reliabilityReadableSessions,
        cost: coverage.cost.publishableSessionCount,
        speed: coverage.speed.completeSessionCount,
        safety: coverage.safetyExaminedSessions,
      }
    : null
  const sessions = overall ? snapshot?.eligibleSessionCount : sessionCounts?.[section]
  const metrics = [
    {
      label: overall ? "Eligible sessions" : "Sessions examined",
      value: sessions == null ? "—" : formatCount(sessions),
    },
    { label: "Scoring window", value: snapshot ? `Last ${snapshot.windowDays} days` : "—" },
    {
      label: "95% confidence range",
      value: result ? `${formatScore(result.interval.lower)}–${formatScore(result.interval.upper)}` : "—",
    },
  ]

  return (
    <div className="flex flex-col px-4 pb-2">
      <div className="flex items-center gap-3 py-4">
        <DimensionScoreRing score={result ? (overall ? Math.floor(result.score) : result.score) : null} />
        <div className="flex min-w-0 flex-col gap-1">
          <Text.H5M>{meta.title}</Text.H5M>
          <Text.H6 color="foregroundMuted">{meta.description}</Text.H6>
        </div>
      </div>
      <div className="flex flex-col divide-y divide-border border-t border-border">
        {metrics.map((metric) => (
          <div key={metric.label} className="flex items-center justify-between gap-4 py-2">
            <Text.H6 color="foregroundMuted">{metric.label}</Text.H6>
            <Text.H6 className="shrink-0 tabular-nums">{metric.value}</Text.H6>
          </div>
        ))}
      </div>
    </div>
  )
}
