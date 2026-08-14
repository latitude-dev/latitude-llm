export function scoreCardSourceTitle(score: {
  readonly source: string
  readonly sourceId: string
  readonly evaluationName: string | null
}): string {
  return score.source === "evaluation" ? (score.evaluationName ?? score.sourceId) : score.sourceId
}

export function scoreCardLinkedSignalId(score: {
  readonly signalId: string | null
  readonly evaluationSignalId: string | null
}): string | null {
  return score.signalId ?? score.evaluationSignalId
}

export function scoreCardEvaluationVerdict(score: {
  readonly source: string
  readonly errored: boolean
  readonly passed: boolean
}): "Present" | "Absent" | null {
  if (score.source !== "evaluation" || score.errored) return null
  return score.passed ? "Present" : "Absent"
}
