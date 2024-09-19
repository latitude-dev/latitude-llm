import { Commit, Evaluation, Workspace } from '@latitude-data/core/browser'

import { BigNumberPanels } from './BigNumberPanels'
import { EvaluationResultsCharts } from './Charts'

export function MetricsSummary({
  workspace,
  commit,
  evaluation,
  documentUuid,
}: {
  workspace: Workspace
  commit: Commit
  evaluation: Evaluation
  documentUuid: string
}) {
  return (
    <div className='flex gap-6 flex-wrap'>
      <EvaluationResultsCharts
        evaluation={evaluation}
        documentUuid={documentUuid}
      />
      <div className='min-w-[400px] flex-1 flex flex-col gap-y-6'>
        <BigNumberPanels
          workspace={workspace}
          commit={commit}
          evaluation={evaluation}
          documentUuid={documentUuid}
        />
      </div>
    </div>
  )
}
