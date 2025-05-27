import { findWorkspaceFromDocumentLog } from '../../data-access'
import { findCommitById } from '../../data-access/commits'
import { DocumentLogsWithErrorsRepository } from '../../repositories'
import { computeDocumentLogWithMetadata } from '../../services/documentLogs/computeDocumentLogWithMetadata'
import { WebsocketClient } from '../../websockets/workers'
import { DocumentLogCreatedEvent } from '../events'
import { NotFoundError } from './../../lib/errors'

export const notifyToClientDocumentLogCreatedJob = async ({
  data: event,
}: {
  data: DocumentLogCreatedEvent
}) => {
  const { id, workspaceId } = event.data
  const repo = new DocumentLogsWithErrorsRepository(workspaceId)
  const documentLog = await repo.find(id).then((r) => r.unwrap())
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
