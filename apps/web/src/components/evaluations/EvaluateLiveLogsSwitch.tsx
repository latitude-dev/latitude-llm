import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import {
  EvaluationMetric,
  EvaluationType,
  EvaluationV2,
  EvaluationTriggerMode,
} from '@latitude-data/constants'
import { SwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
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

  const currentSettings = evaluation.configuration.trigger

  const setLiveEvaluationEnabled = useCallback(
    async (value: boolean) => {
      if (isDisabled) return
      await updateEvaluation({
        documentUuid: document.documentUuid,
        evaluationUuid: evaluation.uuid,
        settings: {
          configuration: {
            ...evaluation.configuration,
            trigger: {
              ...currentSettings,
              mode: value
                ? (currentSettings?.mode && currentSettings.mode !== EvaluationTriggerMode.Disabled
                    ? currentSettings.mode
                    : EvaluationTriggerMode.EveryInteraction)
                : EvaluationTriggerMode.Disabled,
            },
          },
        },
      })
    },
    [
      isDisabled,
      evaluation,
      updateEvaluation,
      document.documentUuid,
      currentSettings,
    ],
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

  const isEnabled =
    currentSettings?.mode !== undefined &&
    currentSettings.mode !== EvaluationTriggerMode.Disabled

  return (
    <Tooltip
      asChild
      trigger={
        <div>
          <SwitchToggle
            checked={isEnabled}
            onCheckedChange={setLiveEvaluationEnabled}
            disabled={isDisabled}
          />
        </div>
      }
      align='center'
      side='top'
    >
      {isEnabled ? 'Disable' : 'Enable'} live evaluation
    </Tooltip>
  )
}
