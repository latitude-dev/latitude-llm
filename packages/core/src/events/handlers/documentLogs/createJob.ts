import { DocumentRunEvent } from '..'
import { CommitsRepository } from '../../../repositories'
import {
  createDocumentLog,
  CreateDocumentLogProps,
} from '../../../services/documentLogs'
import { WebsocketClient } from '../../../websockets/workers'

export type CreateDocumentLogJobData = CreateDocumentLogProps

export const createDocumentLogJob = async ({
  data: event,
}: {
  data: DocumentRunEvent
}) => {
  const websockets = await WebsocketClient.getSocket()
  const workspaceId = event.data.workspaceId
  const scope = new CommitsRepository(workspaceId)
  const commit = await scope
    .getCommitByUuid({
      projectId: event.data.projectId,
      uuid: event.data.commitUuid,
    })
    .then((r) => r.unwrap())

  const documentLog = await createDocumentLog({
    commit,
    data: {
      customIdentifier: event.data.customIdentifier,
      documentUuid: event.data.documentUuid,
      duration: event.data.duration,
      parameters: event.data.parameters,
      resolvedContent: event.data.resolvedContent,
      uuid: event.data.documentLogUuid,
      source: event.data.source,
    },
  }).then((r) => r.unwrap())

  // TODO: Move to its own event handler.
  websockets.emit('documentLogCreated', {
    workspaceId,
    data: {
      workspaceId,
      documentUuid: event.data.documentUuid,
      commitUuid: event.data.commitUuid,
      documentLogId: documentLog.id,
    },
  })
}
