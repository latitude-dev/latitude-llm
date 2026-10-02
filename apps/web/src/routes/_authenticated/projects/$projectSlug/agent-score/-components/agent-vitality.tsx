import { Skeleton, Text, TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger } from "@repo/ui"
import { type ReactNode, useState } from "react"
import type {
  AgentScoreExplanationRecord,
  AgentScoreRecord,
} from "../../../../../../domains/agent-score/agent-score.functions.ts"
import { SCORE_DIMENSION_ORDER, type ScoreDimensionKey } from "./agent-score-format.ts"
import { type VitalityRingSection, VitalityScoreRing } from "./score-ring.tsx"
import { VitalityHoverContent } from "./vitality-hover-content.tsx"

function AgentVitalitySkeleton() {
  return (
    <output
      className="flex w-[240px] shrink-0 @max-[48rem]:w-full flex-col items-center justify-center gap-4 px-6 py-4"
      aria-label="Loading Agent Score"
      aria-busy="true"
    >
      <div className="relative flex h-44 w-44 items-center justify-center">
        <Skeleton className="absolute inset-1 rounded-full" />
        <div className="absolute inset-4 rounded-full bg-secondary" />
        <div className="relative flex flex-col items-center gap-1">
          <Skeleton className="h-9 w-16" />
          <Text.H6 color="foregroundMuted">Agent vitality</Text.H6>
        </div>
      </div>
    </output>
  )
}

export function AgentVitality({
  snapshot,
  dimensionWeights,
  explanation,
  isLoading,
  actions,
}: {
  readonly snapshot: AgentScoreRecord | null
  readonly dimensionWeights: Readonly<Record<ScoreDimensionKey, number>> | undefined
  readonly actions?: ReactNode
  readonly isLoading: boolean
  readonly explanation: AgentScoreExplanationRecord["explanation"]
}) {
  const [activeSection, setActiveSection] = useState<VitalityRingSection | null>(null)
  if (isLoading) return <AgentVitalitySkeleton />

  const dimensions = SCORE_DIMENSION_ORDER.map((dimension) => ({
    id: dimension,
    weight: dimensionWeights?.[dimension] ?? 1 / SCORE_DIMENSION_ORDER.length,
    score: snapshot?.dimensions[dimension]?.score ?? null,
  }))

  return (
    <div className="relative flex w-[240px] shrink-0 @max-[48rem]:w-full flex-col items-center justify-center gap-4 px-6 py-4">
      <div className="absolute top-0 left-0">{actions}</div>
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
    </div>
  )
}
