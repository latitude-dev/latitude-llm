import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { NotFoundError } from '../../lib/errors'
import { WebsocketClient } from '../../websockets/workers'
import { CommitUpdatedEvent } from '../events'

export const notifyClientOfCommitUpdated = async ({
  data: event,
}: {
  data: CommitUpdatedEvent
}) => {
  const { workspaceId, commit } = event.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  await WebsocketClient.sendEvent('commitUpdated', {
    workspaceId: workspace.id,
    data: { workspaceId, commit },
  })
}
