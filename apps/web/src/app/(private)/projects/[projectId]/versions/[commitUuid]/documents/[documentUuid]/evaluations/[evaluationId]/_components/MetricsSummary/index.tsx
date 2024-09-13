'use client'

import { Commit, Evaluation } from '@latitude-data/core/browser'
import { EvaluationResultWithMetadata } from '@latitude-data/core/repositories'
import { useCurrentCommit } from '@latitude-data/web-ui'

import { BigNumberPanels } from './BigNumberPanels'

export function MetricsSummary({
  evaluation,
  evaluationResults,
}: {
  evaluation: Evaluation
  evaluationResults: EvaluationResultWithMetadata[]
}) {
  const { commit } = useCurrentCommit()

  return (
    <div className='flex gap-6 flex-wrap'>
      <div className='min-h-[192px] min-w-[300px] flex-1 bg-muted-foreground rounded-lg' />
      <div className='min-h-[192px] min-w-[300px] flex-1 bg-muted-foreground rounded-lg' />
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
