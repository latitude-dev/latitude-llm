import { useCallback } from 'react'

import { EvaluationDto } from '@latitude-data/core/browser'
import {
  Label,
  SwitchToogle,
  useCurrentCommit,
  useCurrentProject,
  useToast,
} from '@latitude-data/web-ui'
import useConnectedEvaluations from '$/stores/connectedEvaluations'

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
      description: live ? 'Evaluation is now live' : 'Evaluation is now paused',
    })
  }, [connectedEvaluation, update])
  if (!connectedEvaluation) return null

  return (
    <div className='flex flex-row gap-2 items-center'>
      <Label>Evaluate live logs</Label>
      <SwitchToogle
        disabled={isUpdating}
        checked={connectedEvaluation.live}
        onCheckedChange={toggleLive}
      />
    </div>
  )
}
