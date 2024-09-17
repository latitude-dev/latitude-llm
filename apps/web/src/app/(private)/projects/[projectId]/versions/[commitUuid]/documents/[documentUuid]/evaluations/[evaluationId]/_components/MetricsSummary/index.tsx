'use client'

import { Commit, Evaluation } from '@latitude-data/core/browser'
import { EvaluationResultWithMetadata } from '@latitude-data/core/repositories'
import { useCurrentCommit } from '@latitude-data/web-ui'

import { BigNumberPanels } from './BigNumberPanels'
import { EvaluationResultsCharts } from './Charts'

export function MetricsSummary({
  evaluation,
  documentUuid,
  evaluationResults,
}: {
  evaluation: Evaluation
  documentUuid: string
  evaluationResults: EvaluationResultWithMetadata[]
}) {
  const { commit } = useCurrentCommit()

  return (
    <div className='flex gap-6 flex-wrap'>
      <EvaluationResultsCharts
        evaluation={evaluation}
        documentUuid={documentUuid}
      />
      <div className='min-w-[400px] flex-1'>
        <BigNumberPanels
          evaluation={evaluation}
          evaluationResults={evaluationResults}
          commit={commit as Commit}
        />
      </div>
    </div>
  )
}
