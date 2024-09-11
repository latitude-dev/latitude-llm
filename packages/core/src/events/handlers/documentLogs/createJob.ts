import { DocumentRunEvent } from '..'
import { CommitsRepository } from '../../../repositories'
import {
  createDocumentLog,
  CreateDocumentLogProps,
} from '../../../services/documentLogs'

export type CreateDocumentLogJobData = CreateDocumentLogProps

export const createDocumentLogJob = async ({
  data: event,
}: {
  data: DocumentRunEvent
}) => {
  const scope = new CommitsRepository(event.data.workspaceId)
  const commit = await scope
    .getCommitByUuid({
      projectId: event.data.projectId,
      uuid: event.data.commitUuid,
    })
    .then((r) => r.unwrap())

  await createDocumentLog({
    commit,
    data: {
      customIdentifier: event.data.customIdentifier,
      documentUuid: event.data.documentUuid,
      duration: event.data.duration,
      parameters: event.data.parameters,
      resolvedContent: event.data.resolvedContent,
      uuid: event.data.documentLogUuid,
    },
  }).then((r) => r.unwrap())
}
