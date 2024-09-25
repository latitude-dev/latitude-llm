import {
  Commit,
  EvaluationAggregationTotals,
  EvaluationDto,
  EvaluationMeanValue,
  EvaluationModalValue,
} from '@latitude-data/core/browser'

import MeanValuePanel from './MeanValuePanel'
import ModalValuePanel from './ModalValuePanel'
import TotalsPanels from './TotalsPanels'

export function BigNumberPanels<T extends boolean>({
  commit,
  evaluation,
  documentUuid,
  aggregationTotals,
  isNumeric,
  meanOrModal,
}: {
  isNumeric: T
  commit: Commit
  evaluation: EvaluationDto
  documentUuid: string
  aggregationTotals: EvaluationAggregationTotals
  meanOrModal: T extends true ? EvaluationMeanValue : EvaluationModalValue
}) {
  return (
    <div className='flex flex-wrap gap-6'>
      <TotalsPanels
        aggregation={aggregationTotals}
        commitUuid={commit.uuid}
        documentUuid={documentUuid}
        evaluationId={evaluation.id}
      />

      {isNumeric && (
        <MeanValuePanel
          mean={meanOrModal as EvaluationMeanValue}
          evaluation={evaluation}
          commitUuid={commit.uuid}
          documentUuid={documentUuid}
        />
      )}

      {!isNumeric && (
        <ModalValuePanel
          modal={meanOrModal as EvaluationModalValue}
          evaluationId={evaluation.id}
          commitUuid={commit.uuid}
          documentUuid={documentUuid}
        />
      )}
    </div>
  )
}
