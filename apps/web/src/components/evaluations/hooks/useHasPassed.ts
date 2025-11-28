import { useMemo } from 'react'
import {
  EvaluationMetric,
  EvaluationResultV2,
  EvaluationType,
  EvaluationV2,
} from '@latitude-data/constants'

export function useHasPassed<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  evaluation,
  result,
  score,
}: {
  evaluation: EvaluationV2<T, M>
  result?: EvaluationResultV2<T, M>
  score: number | null | undefined
}) {
  return useMemo(() => {
    if (score === undefined) return result?.hasPassed
    const reverseScale = evaluation.configuration.reverseScale
    return reverseScale ? score === 0 : score === 1
  }, [score, evaluation.configuration.reverseScale, result?.hasPassed])
}
