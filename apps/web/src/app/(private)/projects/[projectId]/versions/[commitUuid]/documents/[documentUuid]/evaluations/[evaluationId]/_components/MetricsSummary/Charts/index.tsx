'use client'

import {
  Evaluation,
  EvaluationResultableType,
} from '@latitude-data/core/browser'

import { NumericalCharts } from './Numerical'

export function EvaluationResultsCharts({
  evaluation,
  documentUuid,
}: {
  evaluation: Evaluation
  documentUuid: string
}) {
  if (evaluation.configuration.type === EvaluationResultableType.Number) {
    return (
      <NumericalCharts evaluation={evaluation} documentUuid={documentUuid} />
    )
  }

  return null
}
