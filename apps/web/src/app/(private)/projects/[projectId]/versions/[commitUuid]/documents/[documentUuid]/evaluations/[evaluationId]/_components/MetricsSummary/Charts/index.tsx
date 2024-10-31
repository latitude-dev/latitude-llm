import {
  EvaluationDto,
  EvaluationResultableType,
} from '@latitude-data/core/browser'

import { NumericalCharts } from './Numerical'

export function EvaluationResultsCharts({
  evaluation,
  documentUuid,
}: {
  evaluation: EvaluationDto
  documentUuid: string
}) {
  if (evaluation.resultType != EvaluationResultableType.Number) return null
  return <NumericalCharts evaluation={evaluation} documentUuid={documentUuid} />
}
