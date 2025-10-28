import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { NotFoundError } from '../../lib/errors'
import { SpansRepository } from '../../repositories'
import { WebsocketClient } from '../../websockets/workers'
import { EvaluationResultV2CreatedEvent } from '../events'

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
    spanId,
    traceId,
    dataset,
    datasetRow,
  } = event.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  const spansRepo = new SpansRepository(workspace.id)
  const span = await spansRepo.get({ traceId, spanId }).then((r) => r.value)
  if (!span) return

  await WebsocketClient.sendEvent('evaluationResultV2Created', {
    workspaceId: workspace.id,
    data: {
      workspaceId: workspace.id,
      result: result,
      evaluation: evaluation,
      commit: commit,
      span,
      dataset: dataset,
      datasetRow: datasetRow,
    },
  })
}
