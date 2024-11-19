import { createEvaluationResultAction } from '$/actions/evaluationResults/create'
import { updateEvaluationResultAction } from '$/actions/evaluationResults/update'
import useLatitudeAction from '$/hooks/useLatitudeAction'

export default function useEvaluationResults() {
  const { execute: create } = useLatitudeAction(createEvaluationResultAction)
  const { execute: update } = useLatitudeAction(updateEvaluationResultAction)

  return { create, update }
}
