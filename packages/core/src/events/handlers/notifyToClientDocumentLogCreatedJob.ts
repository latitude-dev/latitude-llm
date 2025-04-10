import { findWorkspaceFromDocumentLog } from '../../data-access'
import { findCommitById } from '../../data-access/commits'
import { computeDocumentLogWithMetadata } from '../../services/documentLogs'
import { WebsocketClient } from '../../websockets/workers'
import { DocumentLogCreatedEvent } from '../events'
import { NotFoundError } from './../../lib/errors'

export const notifyToClientDocumentLogCreatedJob = async ({
  data: event,
}: {
  data: DocumentLogCreatedEvent
}) => {
  const documentLog = event.data
  const workspace = await findWorkspaceFromDocumentLog(documentLog)
  if (!workspace) throw new NotFoundError('Workspace not found')

  let commit
  try {
    commit = await findCommitById({ id: documentLog.commitId }).then((r) =>
      r.unwrap(),
    )
  } catch (error) {
    // do nothing, we don't wanna retry the job
    return
  }

  let documentLogWithMetadata
  try {
    documentLogWithMetadata = await computeDocumentLogWithMetadata(
      documentLog,
    ).then((r) => r.unwrap())
  } catch (error) {
    // do nothing, we don't wanna retry the job
    return
  }

  const websockets = await WebsocketClient.getSocket()

  websockets.emit('documentLogCreated', {
    workspaceId: workspace.id,
    data: {
      workspaceId: workspace.id,
      documentUuid: documentLog.documentUuid,
      documentLogId: documentLog.id,
      commitUuid: commit.uuid,
      documentLogWithMetadata,
    },
  })
}
