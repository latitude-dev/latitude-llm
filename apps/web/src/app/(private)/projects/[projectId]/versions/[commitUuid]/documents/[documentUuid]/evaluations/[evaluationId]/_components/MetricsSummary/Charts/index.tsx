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
  const isNumerical =
    evaluation.configuration.type === EvaluationResultableType.Number

  if (!isNumerical) return null

  return <NumericalCharts evaluation={evaluation} documentUuid={documentUuid} />
}
