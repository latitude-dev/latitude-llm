import type { CostScoringArtifact } from "../entities/cost-scoring-artifact.ts"
import type { ToolDefinitionWindowObservation } from "../entities/session-assessment-input.ts"
import { interpolateCostPenalty } from "./evaluate-cost-curve.ts"

export interface WindowDeadSurfaceEvidence {
  readonly metricId: string
  readonly curveId: string
  readonly eligibleInputTokens: number
  readonly definitions: readonly ToolDefinitionWindowObservation[]
  readonly baseContextPenalty: number
}

export const deadSurfacePenaltyIncrease = ({
  evidence,
  usedToolNames,
  artifact,
}: {
  readonly evidence: WindowDeadSurfaceEvidence
  readonly usedToolNames: ReadonlySet<string>
  readonly artifact: CostScoringArtifact
}): number => {
  const curve = artifact.metricCurves.find((candidate) => candidate.curveId === evidence.curveId)
  if (!curve || evidence.eligibleInputTokens <= 0) return 0

  const deadTokens = Math.min(
    evidence.eligibleInputTokens,
    evidence.definitions
      .filter((definition) => !usedToolNames.has(definition.name.toLowerCase()))
      .reduce((total, definition) => total + definition.inputTokens, 0),
  )
  const rawValue = deadTokens / evidence.eligibleInputTokens
  const metricCap = artifact.metricCaps[evidence.metricId] ?? 1
  const metricPenalty = Math.min(metricCap, interpolateCostPenalty({ curve, rawValue }))
  const contextPenalty = Math.min(artifact.familyCaps.context, evidence.baseContextPenalty + metricPenalty)

  return Math.max(0, contextPenalty - evidence.baseContextPenalty)
}
