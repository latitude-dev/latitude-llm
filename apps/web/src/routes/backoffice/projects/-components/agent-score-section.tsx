import { Badge, Icon, Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { GaugeIcon } from "lucide-react"
import type { AdminAgentScoreDto } from "../../../../domains/admin/agent-score.functions.ts"
import {
  buildDimensionEvidence,
  type DimensionEvidenceRow,
} from "../../../_authenticated/projects/$projectSlug/agent-score/-components/dimension-evidence.ts"
import { DashboardSection } from "../../-components/dashboard/index.ts"

const DIMENSIONS = [
  { key: "outcome", label: "Outcome" },
  { key: "reliability", label: "Reliability" },
  { key: "cost", label: "Cost" },
  { key: "speed", label: "Speed" },
  { key: "safety", label: "Safety" },
] as const

const formatScore = (score: number): string => score.toFixed(0)

const formatCount = (count: number): string => count.toLocaleString()

type Explanation = NonNullable<AdminAgentScoreDto["explanation"]>
type Snapshot = NonNullable<AdminAgentScoreDto["snapshot"]>

const affectedReasons = ({
  dimension,
  snapshot,
  explanation,
}: {
  readonly dimension: (typeof DIMENSIONS)[number]["key"]
  readonly snapshot: Snapshot
  readonly explanation: Explanation
}): readonly DimensionEvidenceRow[] =>
  [...buildDimensionEvidence({ dimension, snapshot, explanation }).affected].sort(
    (left, right) => Number(Boolean(left.signalId)) - Number(Boolean(right.signalId)),
  )

const visibleReasonValue = (reason: DimensionEvidenceRow): string | null =>
  reason.valueKind === "scorePoints" ? null : reason.value

function AgentScoreCauses({
  snapshot,
  explanation,
}: {
  readonly snapshot: Snapshot
  readonly explanation: Explanation | null
}) {
  const dimensionsWithCauses = explanation
    ? DIMENSIONS.map((dimension) => ({
        ...dimension,
        reasons: affectedReasons({ dimension: dimension.key, snapshot, explanation }),
      })).filter((dimension) => dimension.reasons.length > 0)
    : []

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <Text.H6 weight="medium">What affected this score</Text.H6>
          <Text.H7 color="foregroundMuted">
            Causes are live evidence for this scoring window, not stored historical decomposition.
          </Text.H7>
        </div>
        {explanation ? (
          <Text.H7 color="foregroundMuted">
            Updated {relativeTime(explanation.computedAt)} · {formatCount(explanation.readSessionCount)} sessions read
          </Text.H7>
        ) : null}
      </div>

      {explanation ? (
        dimensionsWithCauses.length > 0 ? (
          <div className="flex flex-col divide-y divide-border rounded-md border border-border">
            {dimensionsWithCauses.map((dimension) => (
              <div key={dimension.key} className="flex flex-col gap-2 p-3">
                <Text.H7 color="foregroundMuted">{dimension.label}</Text.H7>
                <div className="flex flex-col divide-y divide-border">
                  {dimension.reasons.map((reason) => (
                    <div key={reason.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                      <Text.H6 weight="medium">{reason.label}</Text.H6>
                      {visibleReasonValue(reason) ? (
                        <Text.H6 color="foregroundMuted">{visibleReasonValue(reason)}</Text.H6>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Text.H6 color="foregroundMuted">No material causes affected this score.</Text.H6>
        )
      ) : (
        <Text.H6 color="foregroundMuted">
          Cause evidence has not been prepared for this score or has expired. Use Recalculate Agent Score below to
          refresh it.
        </Text.H6>
      )}
    </div>
  )
}

const formatDate = (date: string): string =>
  new Date(`${date}T00:00:00.000Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })

export function AgentScoreSection({ agentScore }: { readonly agentScore: AdminAgentScoreDto }) {
  const snapshot = agentScore.snapshot

  return (
    <DashboardSection
      title={
        <span className="flex items-center gap-2">
          <Icon icon={GaugeIcon} size="sm" />
          <Text.H6 weight="semibold">Agent Score</Text.H6>
        </span>
      }
      aside={
        <Badge variant={agentScore.customerAccessEnabled ? "outlineSuccessMuted" : "outlineMuted"}>
          Customer access {agentScore.customerAccessEnabled ? "enabled" : "disabled"}
        </Badge>
      }
    >
      {snapshot ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline gap-1">
                <Text.H1 weight="semibold" className="tabular-nums">
                  {formatScore(snapshot.score)}
                </Text.H1>
                <Text.H5 color="foregroundMuted">/ 100</Text.H5>
              </div>
              <Text.H6 color="foregroundMuted">
                {snapshot.date === agentScore.currentDate ? "Current score" : "Latest published score"}
              </Text.H6>
            </div>

            <div className="flex flex-col items-end gap-1 text-right">
              <Text.H6 weight="medium">{formatDate(snapshot.date)} UTC</Text.H6>
              <Text.H7 color="foregroundMuted">
                {snapshot.windowDays}-day window · {snapshot.eligibleSessionCount.toLocaleString()} eligible sessions
              </Text.H7>
              {snapshot.date !== agentScore.currentDate ? (
                <Text.H7 color="foregroundMuted">No score was published today.</Text.H7>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {DIMENSIONS.map((dimension) => (
              <div
                key={dimension.key}
                className="flex min-w-28 flex-1 flex-col gap-1 rounded-md border border-border bg-muted/20 p-3"
              >
                <Text.H7 color="foregroundMuted">{dimension.label}</Text.H7>
                <Text.H4 weight="semibold" className="tabular-nums">
                  {formatScore(snapshot.dimensions[dimension.key].score)}
                </Text.H4>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3">
            <Text.H7 color="foregroundMuted">Version {snapshot.scoringVersion}</Text.H7>
            <Text.H7 color="foregroundMuted">Computed {relativeTime(snapshot.createdAt)}</Text.H7>
            <Text.H7 color="foregroundMuted">
              95% interval {formatScore(snapshot.interval.lower)}–{formatScore(snapshot.interval.upper)}
            </Text.H7>
            {snapshot.policyCap !== null ? (
              <Text.H7 color="foregroundMuted">Policy cap {formatScore(snapshot.policyCap)}</Text.H7>
            ) : null}
          </div>

          <AgentScoreCauses snapshot={snapshot} explanation={agentScore.explanation} />
        </div>
      ) : (
        <div className="flex flex-col gap-1 rounded-md border border-dashed border-border bg-muted/30 p-4">
          <Text.H6 weight="medium">No published Agent Score yet.</Text.H6>
          <Text.H6 color="foregroundMuted">
            No snapshot has been stored. The project may not yet meet the session and dimension requirements needed to
            publish a score.
          </Text.H6>
        </div>
      )}
    </DashboardSection>
  )
}
