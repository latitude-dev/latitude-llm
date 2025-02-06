import { useCallback } from 'react'

import useConnectedEvaluations from '$/stores/connectedEvaluations'
import { EvaluationDto } from '@latitude-data/core/browser'
import {
  SwitchToogle,
  useCurrentCommit,
  useCurrentProject,
  useToast,
} from '@latitude-data/web-ui'

export default function LiveEvaluationToggle({
  documentUuid,
  evaluation,
}: {
  documentUuid: string
  evaluation: EvaluationDto
}) {
  const { toast } = useToast()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { data, update, isUpdating } = useConnectedEvaluations({
    documentUuid,
    projectId: project.id,
    commitUuid: commit.uuid,
  })
  const connectedEvaluation = data.find(
    (ev) => ev.evaluationId === evaluation.id,
  )
  const toggleLive = useCallback(async () => {
    if (!connectedEvaluation) return

    const live = !connectedEvaluation.live
    const [_, error] = await update({
      id: connectedEvaluation.id,
      data: { live },
    })
    if (error) return

    toast({
      title: 'Successfully updated evaluation',
      description: live
        ? `${evaluation.name} is now live`
        : `${evaluation.name} is now paused`,
    })
  }, [connectedEvaluation, update])
  if (!connectedEvaluation) return null

  return (
    <SwitchToogle
      disabled={isUpdating}
      checked={connectedEvaluation.live}
      onCheckedChange={toggleLive}
    />
  )
}
