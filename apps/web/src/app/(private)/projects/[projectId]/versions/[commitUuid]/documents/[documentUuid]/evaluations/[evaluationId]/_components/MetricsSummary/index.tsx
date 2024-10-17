'use client'

import { Commit, EvaluationDto } from '@latitude-data/core/browser'

import { BigNumberPanels } from './BigNumberPanels'
import { EvaluationResultsCharts } from './Charts'

export function MetricsSummary<T extends boolean>({
  commit,
  evaluation,
  documentUuid,
  isNumeric,
}: {
  commit: Commit
  evaluation: EvaluationDto
  documentUuid: string
  isNumeric: T
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
          isNumeric={isNumeric}
        />
      </div>
    </div>
  )
}
