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
        evaluation={evaluation}
        commitUuid={commit.uuid}
        documentUuid={documentUuid}
      />

      {evaluation.resultType == EvaluationResultableType.Number ? (
        <MeanValuePanel
          evaluation={evaluation}
          commitUuid={commit.uuid}
          documentUuid={documentUuid}
        />
      ) : (
        <ModalValuePanel
          evaluation={evaluation}
          commitUuid={commit.uuid}
          documentUuid={documentUuid}
        />
      )}
    </div>
  )
}
