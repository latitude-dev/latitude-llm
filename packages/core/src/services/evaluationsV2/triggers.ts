import {
  EvaluationTriggerTarget,
  Span,
  TriggerConfiguration,
} from '../../constants'

export function getTriggerTarget(
  trigger?: TriggerConfiguration,
): EvaluationTriggerTarget {
  return trigger?.target ?? 'every'
}

export function selectSpansForTrigger(
  spans: Span[],
  triggerTarget: EvaluationTriggerTarget,
): Span[] {
  if (spans.length === 0) return []

  switch (triggerTarget) {
    case 'first':
      return [spans[0]!]
    case 'last':
      return [spans[spans.length - 1]!]
    case 'every':
    default:
      return spans
  }
}
