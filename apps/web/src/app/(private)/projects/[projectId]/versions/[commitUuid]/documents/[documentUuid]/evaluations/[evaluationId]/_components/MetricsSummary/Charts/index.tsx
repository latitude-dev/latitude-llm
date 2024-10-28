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
  const isNumerical =
    (evaluation.configuration ?? evaluation.metadata.configuration)!.type ===
    EvaluationResultableType.Number

  if (!isNumerical) return null

  return <NumericalCharts evaluation={evaluation} documentUuid={documentUuid} />
}
