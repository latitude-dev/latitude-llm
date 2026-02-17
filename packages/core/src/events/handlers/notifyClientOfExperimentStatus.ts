import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { NotFoundError } from '../../lib/errors'
import { ExperimentDto } from '../../schema/models/types/Experiment'
import { WebsocketClient } from '../../websockets/workers'

export type ExperimentStatusEventData = {
  workspaceId: number
  experiment: ExperimentDto
}

export const notifyClientOfExperimentStatus = async ({
  workspaceId,
  experiment,
}: ExperimentStatusEventData) => {
  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  await WebsocketClient.sendEvent('experimentStatus', {
    workspaceId: workspace.id,
    data: {
      experiment,
    },
  })
}
