export function scoreCardSourceTitle(score: { readonly source: string; readonly sourceId: string }): string | null {
  if (score.source === "evaluation") return null
  return score.sourceId
}

export function scoreCardLinkedSignalId(score: {
  readonly signalId: string | null
  readonly evaluationSignalId: string | null
}): string | null {
  return score.evaluationSignalId ?? score.signalId
}

export function scoreCardEvaluationVerdict(score: {
  readonly source: string
  readonly errored: boolean
  readonly passed: boolean
}): "Present" | "Absent" | null {
  if (score.source !== "evaluation" || score.errored) return null
  return score.passed ? "Present" : "Absent"
}
