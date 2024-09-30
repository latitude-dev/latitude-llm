import { DocumentLogCreatedEvent } from '.'
import { findWorkspaceFromDocumentLog } from '../../data-access'
import { findCommitById } from '../../data-access/commits'
import { NotFoundError } from '../../lib'
import { WebsocketClient } from '../../websockets/workers'

export const notifyToClientDocumentLogCreatedJob = async ({
  data: event,
}: {
  data: DocumentLogCreatedEvent
}) => {
  const documentLog = event.data
  const workspace = await findWorkspaceFromDocumentLog(documentLog)
  if (!workspace) throw new NotFoundError('Workspace not found')

  const commit = await findCommitById({ id: documentLog.commitId }).then((r) =>
    r.unwrap(),
  )

  console.log('NEW DOCUMENT LOG!')
  const websockets = await WebsocketClient.getSocket()
  websockets.emit('documentLogCreated', {
    workspaceId: workspace.id,
    data: {
      workspaceId: workspace.id,
      documentUuid: documentLog.documentUuid,
      documentLogId: documentLog.id,
      commitUuid: commit.uuid,
    },
  })
}
