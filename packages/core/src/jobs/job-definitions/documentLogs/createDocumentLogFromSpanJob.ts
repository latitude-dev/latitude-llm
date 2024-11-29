import type { Job } from 'bullmq'

import { HEAD_COMMIT, LogSources } from '../../../browser'
import { Span } from '../../../browser'
import { findCommitByUuid } from '../../../data-access/commits'
import { unsafelyFindDocumentVersionByPath } from '../../../data-access/documentVersions'
import { createDocumentLog } from '../../../services/documentLogs'
import { generateUUIDIdentifier } from '../../../lib'
import { ToolCall } from '@latitude-data/compiler'

export type CreateDocumentLogFromSpanJobData = {
  span: Span
  distinctId: string | undefined | null
  promptPath: string
  commitUuid: string | undefined | null
  projectId: number
}

export async function createDocumentLogFromSpanJob(
  job: Job<CreateDocumentLogFromSpanJobData>,
) {
  const { span, distinctId, promptPath, commitUuid, projectId } = job.data
  if (span.internalType !== 'generation') return

  const commit = await findCommitByUuid({
    projectId,
    uuid: commitUuid ?? HEAD_COMMIT,
  }).then((r) => r.value)
  if (!commit) return

  const document = await unsafelyFindDocumentVersionByPath({
    projectId,
    commitUuid: commit.uuid,
    path: promptPath!,
  })
  if (!document) return

  // @ts-ignore - Fix when we fix types in compiler
  const response = span.output?.[0]?.content
  const toolCalls = span.toolCalls as ToolCall[]

  await createDocumentLog({
    commit,
    data: {
      uuid: generateUUIDIdentifier(),
      documentUuid: document.documentUuid,
      parameters: {},
      resolvedContent: '',
      source: LogSources.API,
      duration:
        span.endTime && span.startTime
          ? new Date(span.endTime).getTime() -
            new Date(span.startTime).getTime()
          : undefined,
      customIdentifier: distinctId ?? undefined,
      createdAt: new Date(),
      providerLog: {
        // @ts-ignore - Fix when we fix types in compiler
        messages: span.input!,
        toolCalls,
        responseText:
          typeof response === 'string' ? response : JSON.stringify(response),
      },
    },
  })
}
