import { SCORE_DIMENSIONS, type ScoreDimension } from "@domain/shared"
import type { SignalScoreEvidence } from "@domain/signals"
import { Badge } from "@repo/ui"

export const SIGNAL_SCORE_DIMENSION_LABELS = {
  outcome: "Outcome",
  reliability: "Reliability",
  cost: "Cost",
  speed: "Speed",
  safety: "Safety",
} satisfies Record<ScoreDimension, string>

function getSignalScoreDimensions(scoreEvidence: readonly SignalScoreEvidence[]): readonly ScoreDimension[] {
  const dimensions = new Set(scoreEvidence.map((evidence) => evidence.scoreDimension))
  return SCORE_DIMENSIONS.filter((dimension) => dimensions.has(dimension))
}

export function SignalScoreDimensions({
  scoreEvidence,
  wrap = true,
}: {
  readonly scoreEvidence: readonly SignalScoreEvidence[]
  readonly wrap?: boolean
}) {
  const dimensions = getSignalScoreDimensions(scoreEvidence)

  if (dimensions.length === 0) return null

  return (
    <ul aria-label="Agent Score dimensions" className={wrap ? "flex flex-row flex-wrap gap-1" : "flex flex-row gap-1"}>
      {dimensions.map((dimension) => (
        <li key={dimension}>
          <Badge variant="outlinePurple" size="small" noWrap>
            {SIGNAL_SCORE_DIMENSION_LABELS[dimension]}
          </Badge>
        </li>
      ))}
    </ul>
  )
}
