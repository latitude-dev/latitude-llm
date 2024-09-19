import {
  Commit,
  Evaluation,
  EvaluationResultableType,
  Workspace,
} from '@latitude-data/core/browser'
import {
  getEvaluationMeanValueQuery,
  getEvaluationModalValueQuery,
  getEvaluationTotalsQuery,
} from '@latitude-data/core/services/evaluationResults/index'

import MeanValuePanel from './MeanValuePanel'
import ModalValuePanel from './ModalValuePanel'
import TotalsPanels from './TotalsPanels'

async function MeanPanel({
  workspaceId,
  evaluation,
  documentUuid,
  commit,
}: {
  workspaceId: number
  evaluation: Evaluation
  documentUuid: string
  commit: Commit
}) {
  const mean = await getEvaluationMeanValueQuery({
    workspaceId,
    evaluation,
    documentUuid,
    commit,
  })

  return (
    <MeanValuePanel
      mean={mean}
      evaluation={evaluation}
      commitUuid={commit.uuid}
      documentUuid={documentUuid}
    />
  )
}

async function ModalPanel({
  workspaceId,
  evaluation,
  documentUuid,
  commit,
}: {
  workspaceId: number
  evaluation: Evaluation
  documentUuid: string
  commit: Commit
}) {
  const modal = await getEvaluationModalValueQuery({
    workspaceId,
    evaluation,
    documentUuid,
    commit,
  })
  return (
    <ModalValuePanel
      modal={modal}
      evaluationId={evaluation.id}
      commitUuid={commit.uuid}
      documentUuid={documentUuid}
    />
  )
}

export async function BigNumberPanels({
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
  const aggregationTotals = await getEvaluationTotalsQuery({
    workspaceId: workspace.id,
    commit,
    evaluation,
    documentUuid,
  })
  const isNumeric =
    evaluation.configuration.type == EvaluationResultableType.Number
  return (
    <div className='flex flex-wrap gap-6'>
      <TotalsPanels
        aggregation={aggregationTotals}
        commitUuid={commit.uuid}
        documentUuid={documentUuid}
        evaluationId={evaluation.id}
      />

      {isNumeric && (
        <MeanPanel
          commit={commit}
          evaluation={evaluation}
          workspaceId={workspace.id}
          documentUuid={documentUuid}
        />
      )}

      {!isNumeric && (
        <ModalPanel
          commit={commit}
          evaluation={evaluation}
          workspaceId={workspace.id}
          documentUuid={documentUuid}
        />
      )}
    </div>
  )
}
