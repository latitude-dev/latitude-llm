import {
  Commit,
  EvaluationDto,
  EvaluationResultableType,
} from '@latitude-data/core/browser'

import MeanValuePanel from './MeanValuePanel'
import ModalValuePanel from './ModalValuePanel'
import TotalsPanels from './TotalsPanels'

export function BigNumberPanels({
  commit,
  evaluation,
  documentUuid,
}: {
  commit: Commit
  evaluation: EvaluationDto
  documentUuid: string
}) {
  return (
    <div className='flex flex-wrap gap-6'>
      <TotalsPanels
        commitUuid={commit.uuid}
        documentUuid={documentUuid}
        evaluationId={evaluation.id}
      />

      {evaluation.resultType == EvaluationResultableType.Number ? (
        <MeanValuePanel
          evaluation={evaluation}
          commitUuid={commit.uuid}
          documentUuid={documentUuid}
        />
      ) : (
        <ModalValuePanel
          evaluationId={evaluation.id}
          commitUuid={commit.uuid}
          documentUuid={documentUuid}
        />
      )}
    </div>
  )
}
