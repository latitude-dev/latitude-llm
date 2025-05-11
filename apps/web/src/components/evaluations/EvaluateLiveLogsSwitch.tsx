import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import {
  EvaluationMetric,
  EvaluationType,
  EvaluationV2,
} from '@latitude-data/constants'
import { SwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
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

  const { updateEvaluation, isUpdatingEvaluation } = useEvaluationsV2({
    project: project,
    commit: commit,
    document: document,
  })

  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  const metricSpecification = typeSpecification?.metrics[evaluation.metric]

  const isDisabled =
    disabled ||
    isUpdatingEvaluation ||
    !metricSpecification?.supportsLiveEvaluation

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

  if (!metricSpecification?.supportsLiveEvaluation) {
    return (
      <Tooltip
        asChild
        trigger={
          <div>
            <SwitchToggle checked={false} disabled={true} />
          </div>
        }
        align='center'
        side='top'
      >
        {typeSpecification?.name} / {metricSpecification?.name} evaluations do
        not support live evaluation
      </Tooltip>
    )
  }

  return (
    <Tooltip
      asChild
      trigger={
        <div>
          <SwitchToggle
            checked={!!evaluation.evaluateLiveLogs}
            onCheckedChange={setEvaluateLiveLogs}
            disabled={isDisabled}
          />
        </div>
      }
      align='center'
      side='top'
    >
      {evaluation.evaluateLiveLogs ? 'Disable' : 'Enable'} live evaluation
    </Tooltip>
  )
}
