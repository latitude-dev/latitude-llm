import { Badge, Skeleton, Text, Tooltip } from "@repo/ui"
import type { AgentScoreExplanationRecord } from "../../../../../../domains/agent-score/agent-score.functions.ts"
import { DIMENSION_LABEL, formatCount, formatHours, type ScoreDimensionKey } from "./agent-score-format.ts"

const formatNative = (effect: { readonly value: number; readonly unit: string }): string => {
  if (effect.unit === "nanoseconds") return formatHours(effect.value)
  if (effect.unit === "sessions") return `${formatCount(Math.round(effect.value))} sessions`
  return `${formatCount(Math.round(effect.value))} ${effect.unit} units`
}

const formatPoints = (points: number): string => (points < 0.05 ? "<0.1" : points.toFixed(1))

function SectionLabel({ children }: { readonly children: React.ReactNode }) {
  return <Text.H6 color="foregroundMuted">{children}</Text.H6>
}

/**
 * Causes for one dimension, most responsible first.
 *
 * Attributed deficit and fix gain are separate columns because they answer different questions and
 * only one of them adds up. Two causes that end the same sessions each recover all of them alone, so
 * summing fix gains promises score that does not exist; the interface never totals that column, and
 * the tooltip says why.
 */
function DimensionCauses({
  dimension,
}: {
  readonly dimension: NonNullable<AgentScoreExplanationRecord["explanation"]>["attribution"][number]
}) {
  if (dimension.rows.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row items-baseline gap-2">
        <SectionLabel>{DIMENSION_LABEL[dimension.scoreDimension as ScoreDimensionKey]}</SectionLabel>
        {dimension.method === "sampled" ? (
          <Tooltip
            asChild
            trigger={
              <span className="cursor-default">
                <Badge variant="muted">approximate</Badge>
              </span>
            }
          >
            Too many causes to attribute exactly, so the shares were sampled. They rank reliably; the last decimal may
            move.
          </Tooltip>
        ) : null}
      </div>
      <div className="divide-y divide-border rounded-lg border border-border">
        <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 py-2">
          <SectionLabel>Cause</SectionLabel>
          <SectionLabel>Effect</SectionLabel>
          <Tooltip
            asChild
            trigger={
              <span className="cursor-default">
                <SectionLabel>Attributed</SectionLabel>
              </span>
            }
          >
            Each cause's share of this dimension's distance from healthy. These add up.
          </Tooltip>
          <Tooltip
            asChild
            trigger={
              <span className="cursor-default">
                <SectionLabel>Fix gain</SectionLabel>
              </span>
            }
          >
            Score recovered if this cause alone disappeared. Fix gains overlap between causes and must not be added
            together.
          </Tooltip>
        </div>
        {dimension.rows.map((row) => (
          <div key={row.causeId} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 py-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <Text.H6B className="truncate">{row.label}</Text.H6B>
              <Text.H6 color="foregroundMuted">
                {row.evidence === "measured"
                  ? `Observed on ${formatCount(row.observationCount)} sessions`
                  : "Associated effect, estimated from matched sessions"}
              </Text.H6>
            </div>
            <Text.H6 color="foregroundMuted" className="tabular-nums">
              {formatNative(row.nativeEffect)}
            </Text.H6>
            <Text.H6B className="tabular-nums">-{formatPoints(row.attributedDeficit)}</Text.H6B>
            <Text.H6 color="foregroundMuted" className="tabular-nums">
              +{formatPoints(row.fixGain)}
            </Text.H6>
          </div>
        ))}
        {dimension.residual > 0.05 ? (
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 py-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <Text.H6B>Not yet explained</Text.H6B>
              <Text.H6 color="foregroundMuted">Deficit no named cause accounts for</Text.H6>
            </div>
            <span />
            <Text.H6B className="tabular-nums">-{formatPoints(dimension.residual)}</Text.H6B>
            <span />
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Issue rows for the two sampled dimensions.
 *
 * Reach, not points. Outcome and Safety come from a holistic verdict and a confirmed-harm union
 * rather than from adding up defects, so these rows say where failures concentrate and never claim
 * how much score removing one would return.
 */
function IssueTable({
  label,
  caption,
  rows,
}: {
  readonly label: string
  readonly caption: string
  readonly rows: NonNullable<AgentScoreExplanationRecord["explanation"]>["issues"]["outcome"]
}) {
  if (rows.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>{label}</SectionLabel>
      <div className="divide-y divide-border rounded-lg border border-border">
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-2">
          <SectionLabel>Issue</SectionLabel>
          <SectionLabel>Estimated reach</SectionLabel>
          <SectionLabel>{caption}</SectionLabel>
        </div>
        {rows.map((row) => (
          <div key={row.issueKey} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <Text.H6B className="truncate">{row.label}</Text.H6B>
              <Text.H6 color="foregroundMuted">
                {row.ranked
                  ? `${formatCount(row.examinedSessions)} examined`
                  : `${formatCount(row.examinedSessions)} examined, not ranked`}
              </Text.H6>
            </div>
            <Text.H6 color="foregroundMuted" className="tabular-nums">
              {row.estimatedReach === undefined ? "unknown" : `${formatCount(Math.round(row.estimatedReach))} sessions`}
            </Text.H6>
            <Text.H6B className="tabular-nums">
              {row.estimatedAdverseReach === undefined
                ? "unknown"
                : `${formatCount(Math.round(row.estimatedAdverseReach))} sessions`}
            </Text.H6B>
          </div>
        ))}
      </div>
    </div>
  )
}

export function CauseRows({
  explanation,
  isLoading,
}: {
  readonly explanation: AgentScoreExplanationRecord | undefined
  readonly isLoading: boolean
}) {
  if (isLoading) return <Skeleton className="h-40 w-full rounded-lg" />

  if (!explanation || explanation.status !== "ready" || !explanation.explanation) {
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-border p-4">
        <Text.H6B>Evidence not prepared yet</Text.H6B>
        <Text.H6 color="foregroundMuted">
          Causes are read from the current window and refreshed daily. The scores above are unaffected.
        </Text.H6>
      </div>
    )
  }

  const evidence = explanation.explanation
  const computedAt = new Date(evidence.computedAt)

  return (
    <div className="flex flex-col gap-6">
      <Text.H6 color="foregroundMuted">
        Current evidence from the last {evidence.window.stepDays} days, read {computedAt.toLocaleString()}. It explains
        present behavior rather than reproducing the score above.
      </Text.H6>
      {evidence.attribution.map((dimension) => (
        <DimensionCauses key={dimension.scoreDimension} dimension={dimension} />
      ))}
      <IssueTable label="Outcome issues" caption="Estimated failed reach" rows={evidence.issues.outcome} />
      <IssueTable label="Confirmed harm" caption="Estimated harmed reach" rows={evidence.issues.safety.confirmedHarm} />
      <IssueTable label="Exposure only" caption="Estimated harmed reach" rows={evidence.issues.safety.exposure} />
    </div>
  )
}
