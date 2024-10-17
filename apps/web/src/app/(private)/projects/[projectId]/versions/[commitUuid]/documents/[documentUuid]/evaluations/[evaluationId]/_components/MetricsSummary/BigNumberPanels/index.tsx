import { Commit, EvaluationDto } from '@latitude-data/core/browser'

import MeanValuePanel from './MeanValuePanel'
import ModalValuePanel from './ModalValuePanel'
import TotalsPanels from './TotalsPanels'

export function BigNumberPanels<T extends boolean>({
  commit,
  evaluation,
  documentUuid,
  isNumeric,
}: {
  isNumeric: T
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

      {isNumeric && (
        <MeanValuePanel
          evaluation={evaluation}
          commitUuid={commit.uuid}
          documentUuid={documentUuid}
        />
      )}

      {!isNumeric && (
        <ModalValuePanel
          evaluationId={evaluation.id}
          commitUuid={commit.uuid}
          documentUuid={documentUuid}
        />
      )}
    </div>
  )
}
