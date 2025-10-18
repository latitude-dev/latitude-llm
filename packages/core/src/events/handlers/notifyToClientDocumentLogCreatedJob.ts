import { findWorkspaceFromDocumentLog } from '../../data-access/workspaces'
import { findCommitById } from '../../data-access/commits'
import { NotFoundError } from '../../lib/errors'
import { DocumentLogsWithErrorsRepository } from '../../repositories'
import { computeDocumentLogWithMetadata } from '../../services/documentLogs/computeDocumentLogWithMetadata'
import { WebsocketClient } from '../../websockets/workers'
import { DocumentLogCreatedEvent } from '../events'

export const notifyToClientDocumentLogCreatedJob = async ({
  data: event,
}: {
  data: DocumentLogCreatedEvent
}) => {
  const { id, workspaceId } = event.data
  const repo = new DocumentLogsWithErrorsRepository(workspaceId)

  let documentLog
  try {
    documentLog = await repo.find(id).then((r) => r.unwrap())
  } catch (_error) {
    // do nothing, we don't wanna retry the job
    return
  }

  const workspace = await findWorkspaceFromDocumentLog(documentLog)
  if (!workspace) throw new NotFoundError('Workspace not found')

  let commit
  try {
    commit = await findCommitById(documentLog.commitId)
    if (!commit) throw new NotFoundError('Commit not found')
  } catch (_error) {
    // do nothing, we don't wanna retry the job
    return
  }

  let documentLogWithMetadata
  try {
    documentLogWithMetadata = await computeDocumentLogWithMetadata(
      documentLog,
    ).then((r) => r.unwrap())
  } catch (_error) {
    // do nothing, we don't wanna retry the job
    return
  }

  await WebsocketClient.sendEvent('documentLogCreated', {
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
