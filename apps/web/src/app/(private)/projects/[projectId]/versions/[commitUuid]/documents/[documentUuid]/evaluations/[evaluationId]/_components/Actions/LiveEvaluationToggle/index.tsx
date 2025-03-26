import { useCallback, useMemo } from 'react'

import useConnectedEvaluations from '$/stores/connectedEvaluations'
import {
  EvaluationDto,
  EvaluationMetadataType,
} from '@latitude-data/core/browser'
import {
  SwitchToggle,
  useCurrentCommit,
  useCurrentProject,
  useToast,
} from '@latitude-data/web-ui'

export default function LiveEvaluationToggle({
  documentUuid,
  evaluation: { id: evaluationId },
  disabled,
}: {
  documentUuid: string
  evaluation: EvaluationDto
  disabled?: boolean
}) {
  const { toast } = useToast()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()

  const {
    data: evaluations,
    isLoading,
    update,
    isUpdating,
  } = useConnectedEvaluations({
    documentUuid: documentUuid,
    projectId: project.id,
    commitUuid: commit.uuid,
  })
  const evaluation = useMemo(
    () =>
      evaluations
        .map(({ id, live, evaluation }) => ({
          connectedId: id,
          live,
          ...evaluation,
        }))
        .find((evaluation) => evaluation.id === evaluationId),
    [evaluations],
  )
  const isDisabled =
    disabled ||
    isLoading ||
    isUpdating ||
    !evaluation ||
    evaluation.metadataType === EvaluationMetadataType.Manual

  const toggleLive = useCallback(async () => {
    if (isDisabled) return

    const live = !evaluation.live
    const [_, error] = await update({
      id: evaluation.connectedId,
      data: { live },
    })
    if (error) return

    toast({
      title: 'Successfully updated evaluation',
      description: live
        ? `${evaluation.name} is now live`
        : `${evaluation.name} is now paused`,
    })
  }, [isDisabled, evaluation, update])

  return (
    <SwitchToggle
      disabled={isDisabled}
      checked={evaluation?.live}
      onCheckedChange={toggleLive}
    />
  )
}
