import type { Message } from '@latitude-data/constants/legacyCompiler'
import { Job } from 'bullmq'

import { type Commit } from '../../../schema/models/types/Commit'
import { LogSources } from '../../../constants'
import { generateUUIDIdentifier } from '../../../lib/generateUUID'
import { DocumentVersionsRepository } from '../../../repositories'
import { createDocumentLog } from '../../../services/documentLogs/create'

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
      commitUuid: commit.uuid,
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
