import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import {
  EvaluationMetric,
  EvaluationType,
  EvaluationV2,
} from '@latitude-data/constants'
import { SwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useCallback } from 'react'
import { EVALUATION_SPECIFICATIONS } from './index'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'

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

  const { toggleLiveMode, isTogglingLiveMode } = useEvaluationsV2({
    project: project,
    commit: commit,
    document: document,
  })

  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  const metricSpecification = typeSpecification?.metrics[evaluation.metric]

  const isDisabled =
    disabled ||
    isTogglingLiveMode ||
    !metricSpecification?.supportsLiveEvaluation

  const setEvaluateLiveLogs = useCallback(
    async (value: boolean) => {
      if (isDisabled) return
      await toggleLiveMode({
        evaluationUuid: evaluation.uuid,
        live: value,
      })
    },
    [isDisabled, evaluation, toggleLiveMode],
  )

  return !metricSpecification?.supportsLiveEvaluation ? (
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
      {metricSpecification?.name} evaluations do not support live evaluation
    </Tooltip>
  ) : (
    <SwitchToggle
      checked={!!evaluation.evaluateLiveLogs}
      onCheckedChange={setEvaluateLiveLogs}
      disabled={isDisabled}
    />
  )
}
