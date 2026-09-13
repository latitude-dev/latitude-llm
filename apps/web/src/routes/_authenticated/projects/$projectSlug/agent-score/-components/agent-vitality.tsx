import { cn, Icon, Skeleton, Text } from "@repo/ui"
import { ChartNoAxesCombinedIcon } from "lucide-react"
import { useState } from "react"
import type {
  AgentScoreExplanationRecord,
  AgentScoreRecord,
} from "../../../../../../domains/agent-score/agent-score.functions.ts"
import { formatCount, SCORE_DIMENSION_ORDER, type ScoreDimensionKey } from "./agent-score-format.ts"
import { type AgentScoreReadinessView, agentScoreReadiness } from "./score-readiness.ts"
import { type VitalityRingSection, VitalityScoreRing } from "./score-ring.tsx"

const DIMENSION_LABELS: Readonly<Record<ScoreDimensionKey, string>> = {
  outcome: "Outcome quality",
  reliability: "Reliability",
  cost: "Cost",
  speed: "Speed",
  safety: "Safety",
}

const previousScore = (
  snapshot: AgentScoreRecord | null,
  history: readonly AgentScoreRecord[] | undefined,
): AgentScoreRecord | null => {
  if (!snapshot || !history) return null
  return [...history].reverse().find((entry) => entry.date < snapshot.date) ?? null
}

function ScoreDelta({ value }: { readonly value: number | null }) {
  if (value === null) return null
  const decreasing = value < 0
  return (
    <>
      <Text.H6 color="foregroundMuted">·</Text.H6>
      <span
        className={`flex flex-row items-center gap-0.5 ${decreasing ? "text-destructive-muted-foreground" : "text-success-muted-foreground"}`}
      >
        <Icon icon={ChartNoAxesCombinedIcon} size="xs" />
        <Text.H6 color="inherit" className="tabular-nums">
          {Math.abs(value * 100).toFixed(1)}% {decreasing ? "down" : "up"}
        </Text.H6>
      </span>
    </>
  )
}

function VitalityDetails({ snapshot, delta }: { readonly snapshot: AgentScoreRecord; readonly delta: number | null }) {
  return (
    <div className="flex flex-row flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
      <Text.H6 color="foregroundMuted">Last {snapshot.windowDays} days</Text.H6>
      <Text.H6 color="foregroundMuted">·</Text.H6>
      <Text.H6 color="foregroundMuted">{formatCount(snapshot.eligibleSessionCount)} sessions</Text.H6>
      <ScoreDelta value={delta} />
    </div>
  )
}

function ReadinessProgress({ value, label }: { readonly value: number; readonly label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <span className="h-full rounded-full bg-primary" style={{ width: `${value * 100}%` }} />
    </div>
  )
}

function DimensionReadinessProgress({
  readiness,
}: {
  readonly readiness: Extract<AgentScoreReadinessView, { kind: "dimensions" }>
}) {
  return (
    <div
      className="flex w-full flex-row gap-1"
      role="img"
      aria-label={`${readiness.readyDimensions} of ${readiness.totalDimensions} score dimensions ready`}
    >
      {SCORE_DIMENSION_ORDER.slice(0, readiness.totalDimensions).map((dimension, index) => (
        <span
          key={dimension}
          className={cn("h-1.5 flex-1 rounded-full", {
            "bg-success-muted-foreground": index < readiness.readyDimensions,
            "bg-muted": index >= readiness.readyDimensions,
          })}
        />
      ))}
    </div>
  )
}

function AgentScoreUnavailable({ explanation }: { readonly explanation: AgentScoreExplanationRecord["explanation"] }) {
  const readiness = agentScoreReadiness(explanation)
  return (
    <section
      className="flex min-h-[296px] min-w-[280px] basis-[30%] flex-col justify-center gap-5 rounded-xl bg-secondary px-6 py-6"
      aria-label="Agent Score readiness"
    >
      <div className="flex flex-col gap-1">
        <Text.H6 color="foregroundMuted">Score readiness</Text.H6>
        <Text.H5M>{readiness.title}</Text.H5M>
        <Text.H6 color="foregroundMuted">{readiness.detail}</Text.H6>
      </div>
      {readiness.kind === "sessions" ? <ReadinessProgress value={readiness.progress} label={readiness.title} /> : null}
      {readiness.kind === "dimensions" ? (
        <div className="flex flex-col gap-3">
          <DimensionReadinessProgress readiness={readiness} />
          {readiness.blockers.length > 0 ? (
            <div className="flex flex-col divide-y divide-border border-y border-border">
              {readiness.blockers.map((blocker) => (
                <div key={blocker.dimension} className="flex items-start justify-between gap-4 py-2.5">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <Text.H6B>{blocker.label}</Text.H6B>
                    <Text.H7 color="foregroundMuted">{blocker.requirement.label}</Text.H7>
                  </div>
                  <Text.H6 className="shrink-0 tabular-nums">{blocker.requirement.value}</Text.H6>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function AgentVitalitySkeleton() {
  return (
    <output
      className="flex min-h-[296px] min-w-[280px] basis-[30%] flex-col items-center justify-center gap-4 rounded-xl bg-secondary px-6 py-6"
      aria-label="Loading Agent Score"
      aria-busy="true"
    >
      <div className="relative flex h-40 w-40 items-center justify-center">
        <Skeleton className="absolute inset-1 rounded-full" />
        <div className="absolute inset-4 rounded-full bg-secondary" />
        <Skeleton className="relative h-7 w-16" />
      </div>
      <div className="flex flex-col items-center gap-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-40" />
      </div>
    </output>
  )
}

export function AgentVitality({
  snapshot,
  history,
  dimensionWeights,
  isLoading,
  explanation,
}: {
  readonly snapshot: AgentScoreRecord | null
  readonly history: readonly AgentScoreRecord[] | undefined
  readonly dimensionWeights: Readonly<Record<ScoreDimensionKey, number>> | undefined
  readonly isLoading: boolean
  readonly explanation: AgentScoreExplanationRecord["explanation"]
}) {
  const [activeSection, setActiveSection] = useState<VitalityRingSection | null>(null)
  if (isLoading) return <AgentVitalitySkeleton />
  if (!snapshot) return <AgentScoreUnavailable explanation={explanation} />

  const previous = previousScore(snapshot, history)
  const delta = snapshot && previous && previous.score > 0 ? (snapshot.score - previous.score) / previous.score : null
  const dimensions = SCORE_DIMENSION_ORDER.map((dimension) => ({
    id: dimension,
    weight: dimensionWeights?.[dimension] ?? 1 / SCORE_DIMENSION_ORDER.length,
    score: snapshot.dimensions[dimension]?.score ?? null,
  }))
  const activeDimension = activeSection && activeSection !== "vitality" ? activeSection : null
  const activeLabel = activeDimension ? DIMENSION_LABELS[activeDimension] : "Agent vitality"

  return (
    <div className="flex min-h-[296px] min-w-[280px] basis-[30%] flex-col items-center justify-center gap-4 rounded-xl bg-secondary px-6 py-6">
      <VitalityScoreRing
        score={snapshot.score}
        dimensions={dimensions}
        activeSection={activeSection}
        onActiveSectionChange={setActiveSection}
      />
      <div className="flex flex-col items-center gap-1 text-center">
        <div className="flex flex-row items-center gap-1.5">
          <Text.H5M>{activeLabel}</Text.H5M>
        </div>
        <VitalityDetails snapshot={snapshot} delta={delta} />
      </div>
    </div>
  )
}
