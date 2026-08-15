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

export function scoreCardSignalLabel(signal: {
  readonly name: string | null
  readonly slug: string | null
}): string | null {
  return signal.name ?? signal.slug
}

export function scoreCardIsAbsentEvaluation(score: {
  readonly source: string
  readonly errored: boolean
  readonly passed: boolean
}): boolean {
  return score.source === "evaluation" && !score.errored && !score.passed
}

export function scoreCardShouldShowValue(score: {
  readonly source: string
  readonly errored: boolean
  readonly passed: boolean
}): boolean {
  return !scoreCardIsAbsentEvaluation(score)
}

export function scoreCardShouldShowFeedback(score: {
  readonly source: string
  readonly errored: boolean
  readonly passed: boolean
  readonly feedback: string | null
}): boolean {
  if (scoreCardIsAbsentEvaluation(score)) return false
  return Boolean(score.feedback?.trim())
}

export function scoreCardEvaluationVerdict(score: {
  readonly source: string
  readonly errored: boolean
  readonly passed: boolean
}): "Present" | "Absent" | null {
  if (score.source !== "evaluation" || score.errored) return null
  return score.passed ? "Present" : "Absent"
}
