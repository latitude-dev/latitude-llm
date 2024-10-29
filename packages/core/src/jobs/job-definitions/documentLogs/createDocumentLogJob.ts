import { Message } from '@latitude-data/compiler'
import { Job } from 'bullmq'

import { Commit } from '../../../browser'
import { LogSources } from '../../../constants'
import { generateUUIDIdentifier } from '../../../lib'
import { DocumentVersionsRepository } from '../../../repositories'
import { createDocumentLog } from '../../../services/documentLogs'

export type CreateDocumentLogJobProps = {
  workspaceId: number
  documentUuid: string
  commit: Commit
  source: LogSources
  messages: Message[]
  responseText: string
}

export const createDocumentLogJob = async (
  job: Job<CreateDocumentLogJobProps>,
) => {
  const { workspaceId, documentUuid, commit, source, messages, responseText } =
    job.data
  const docsRepo = new DocumentVersionsRepository(workspaceId)
  const document = await docsRepo
    .getDocumentByUuid({
      documentUuid,
      commit,
    })
    .then((r) => r.unwrap())

  await createDocumentLog({
    data: {
      uuid: generateUUIDIdentifier(),
      documentUuid: document.documentUuid,
      resolvedContent: document.resolvedContent || '',
      source,
      parameters: {},
      providerLog: {
        messages,
        responseText,
      },
    },
    commit,
  }).then((r) => r.unwrap())
}
