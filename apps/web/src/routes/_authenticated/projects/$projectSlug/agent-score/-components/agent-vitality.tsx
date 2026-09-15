import { Icon, Skeleton, Text, TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger } from "@repo/ui"
import { ChartNoAxesCombinedIcon } from "lucide-react"
import { useState } from "react"
import type {
  AgentScoreExplanationRecord,
  AgentScoreRecord,
} from "../../../../../../domains/agent-score/agent-score.functions.ts"
import { formatCount, SCORE_DIMENSION_ORDER, type ScoreDimensionKey } from "./agent-score-format.ts"
import { type VitalityRingSection, VitalityScoreRing } from "./score-ring.tsx"
import { VitalityHoverContent } from "./vitality-hover-content.tsx"

const previousScore = (
  snapshot: AgentScoreRecord | null,
  history: readonly AgentScoreRecord[] | undefined,
): AgentScoreRecord | null => {
  if (!snapshot || !history) return null
  const previous = [...history].reverse().find((entry) => entry.date < snapshot.date)
  return previous?.scoringVersion === snapshot.scoringVersion ? previous : null
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

function VitalityDetails({
  snapshot,
  delta,
}: {
  readonly snapshot: AgentScoreRecord | null
  readonly delta: number | null
}) {
  if (!snapshot) return <Text.H6 color="foregroundMuted">Score not ready</Text.H6>

  return (
    <div className="flex flex-row flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
      <Text.H6 color="foregroundMuted">Last {snapshot.windowDays} days</Text.H6>
      <Text.H6 color="foregroundMuted">·</Text.H6>
      <Text.H6 color="foregroundMuted">{formatCount(snapshot.eligibleSessionCount)} sessions</Text.H6>
      <ScoreDelta value={delta} />
    </div>
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
  explanation,
  isLoading,
}: {
  readonly snapshot: AgentScoreRecord | null
  readonly history: readonly AgentScoreRecord[] | undefined
  readonly dimensionWeights: Readonly<Record<ScoreDimensionKey, number>> | undefined
  readonly isLoading: boolean
  readonly explanation: AgentScoreExplanationRecord["explanation"]
}) {
  const [activeSection, setActiveSection] = useState<VitalityRingSection | null>(null)
  if (isLoading) return <AgentVitalitySkeleton />

  const previous = previousScore(snapshot, history)
  const delta = snapshot && previous && previous.score > 0 ? (snapshot.score - previous.score) / previous.score : null
  const dimensions = SCORE_DIMENSION_ORDER.map((dimension) => ({
    id: dimension,
    weight: dimensionWeights?.[dimension] ?? 1 / SCORE_DIMENSION_ORDER.length,
    score: snapshot?.dimensions[dimension]?.score ?? null,
  }))

  return (
    <div className="flex min-h-[296px] min-w-[280px] basis-[30%] flex-col items-center justify-center gap-4 rounded-xl bg-secondary px-6 py-6">
      <TooltipProvider>
        <TooltipRoot
          open={activeSection !== null}
          onOpenChange={(open) => {
            if (!open) setActiveSection(null)
          }}
        >
          <TooltipTrigger
            asChild
            // The ring opens immediately; Radix's delayed open would dismiss the already-open tooltip.
            onPointerMove={(event) => event.preventDefault()}
          >
            <div>
              <VitalityScoreRing
                score={snapshot?.score ?? null}
                dimensions={dimensions}
                activeSection={activeSection}
                onActiveSectionChange={setActiveSection}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={12} className="w-80 max-w-80 p-0">
            {activeSection ? (
              <VitalityHoverContent section={activeSection} snapshot={snapshot} explanation={explanation} />
            ) : null}
          </TooltipContent>
        </TooltipRoot>
      </TooltipProvider>
      <div className="flex flex-col items-center gap-1 text-center">
        <div className="flex flex-row items-center gap-1.5">
          <Text.H5M>Agent vitality</Text.H5M>
        </div>
        <VitalityDetails snapshot={snapshot} delta={delta} />
      </div>
    </div>
  )
}
