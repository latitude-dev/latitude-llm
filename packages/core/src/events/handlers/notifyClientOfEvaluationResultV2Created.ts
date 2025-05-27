import { unsafelyFindWorkspace } from '../../data-access'
import { WebsocketClient } from '../../websockets/workers'
import { EvaluationResultV2CreatedEvent } from '../events'
import { NotFoundError } from './../../lib/errors'

export const notifyClientOfEvaluationResultV2Created = async ({
  data: event,
}: {
  data: EvaluationResultV2CreatedEvent
}) => {
  const {
    workspaceId,
    result,
    evaluation,
    commit,
    providerLog,
    dataset,
    datasetRow,
  } = event.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  await WebsocketClient.sendEvent('evaluationResultV2Created', {
    workspaceId: workspace.id,
    data: {
      workspaceId: workspace.id,
      result: result,
      evaluation: evaluation,
      commit: commit,
      providerLog: providerLog,
      dataset: dataset,
      datasetRow: datasetRow,
    },
  })
}
