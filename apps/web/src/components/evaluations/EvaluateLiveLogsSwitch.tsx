import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import useEvaluationsV2 from '$/stores/evaluationsV2'
import {
  EvaluationMetric,
  EvaluationType,
  EvaluationV2,
} from '@latitude-data/constants'
import {
  SwitchToogle,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { useCallback } from 'react'
import { EVALUATION_SPECIFICATIONS } from './index'

export default function EvaluateLiveLogsSwitch<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  evaluation,
  disabled,
}: {
  evaluation: EvaluationV2<T, M>
  disabled?: boolean
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const { updateEvaluation, isExecuting } = useEvaluationsV2({
    project: project,
    commit: commit,
    document: document,
  })

  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  const metricSpecification = typeSpecification?.metrics[evaluation.metric]

  const isDisabled =
    disabled || isExecuting || !metricSpecification?.supportsLiveEvaluation

  const setEvaluateLiveLogs = useCallback(
    async (value: boolean) => {
      if (isDisabled) return
      await updateEvaluation({
        evaluationUuid: evaluation.uuid,
        options: { evaluateLiveLogs: value },
      })
    },
    [isDisabled, evaluation, updateEvaluation],
  )

  return (
    <SwitchToogle
      checked={!!evaluation.evaluateLiveLogs}
      onCheckedChange={setEvaluateLiveLogs}
      disabled={isDisabled}
    />
  )
}
