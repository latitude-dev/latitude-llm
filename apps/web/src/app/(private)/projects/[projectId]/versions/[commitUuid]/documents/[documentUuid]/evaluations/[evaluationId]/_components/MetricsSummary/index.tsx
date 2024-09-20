'use client'

import {
  Commit,
  EvaluationAggregationTotals,
  EvaluationDto,
  EvaluationMeanValue,
  EvaluationModalValue,
} from '@latitude-data/core/browser'

import { BigNumberPanels } from './BigNumberPanels'
import { EvaluationResultsCharts } from './Charts'

export function MetricsSummary<T extends boolean>({
  commit,
  evaluation,
  documentUuid,
  aggregationTotals,
  meanOrModal,
  isNumeric,
}: {
  commit: Commit
  evaluation: EvaluationDto
  documentUuid: string
  aggregationTotals: EvaluationAggregationTotals
  isNumeric: T
  meanOrModal: T extends true ? EvaluationMeanValue : EvaluationModalValue
}) {
  return (
    <div className='flex gap-6 flex-wrap'>
      <EvaluationResultsCharts
        evaluation={evaluation}
        documentUuid={documentUuid}
      />
      <div className='min-w-[400px] flex-1 flex flex-col gap-y-6'>
        <BigNumberPanels
          commit={commit}
          evaluation={evaluation}
          documentUuid={documentUuid}
          aggregationTotals={aggregationTotals}
          isNumeric={isNumeric}
          meanOrModal={meanOrModal}
        />
      </div>
    </div>
  )
}
