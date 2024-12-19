import type { Job } from 'bullmq'

import { HEAD_COMMIT, LogSources } from '../../../browser'
import { Span } from '../../../browser'
import { findCommitByUuid } from '../../../data-access/commits'
import { createDocumentLog } from '../../../services/documentLogs'
import { generateUUIDIdentifier } from '../../../lib'
import {
  findProjectFromDocument,
  findWorkspaceFromSpan,
} from '../../../data-access'
import { DocumentVersionsRepository } from '../../../repositories'
import { CoreAssistantMessage, CoreMessage } from 'ai'

export type CreateDocumentLogFromSpanJobData = {
  span: Span
  workspaceId: string
}

export async function createDocumentLogFromSpanJob(
  job: Job<CreateDocumentLogFromSpanJobData>,
) {
  const { span } = job.data
  if (span.internalType !== 'generation') return
  if (!span.documentUuid) return

  const workspace = await findWorkspaceFromSpan(span)
  if (!workspace) return

  const docsRepo = new DocumentVersionsRepository(workspace.id)
  let document = await docsRepo
    .getDocumentByUuid({
      documentUuid: span.documentUuid,
      commitUuid: span.commitUuid ?? undefined,
    })
    .then((r) => r.value)
  if (!document) {
    // Get it from HEAD commit if not found in the provided commit
    document = await docsRepo
      .getDocumentByUuid({ documentUuid: span.documentUuid })
      .then((r) => r.unwrap())
  }
  if (!document) return

  const project = await findProjectFromDocument(document)
  if (!project) return

  const commit = await findCommitByUuid({
    projectId: project.id,
    uuid: span.commitUuid ?? HEAD_COMMIT,
  }).then((r) => r.unwrap())
  if (!commit) return

  // @ts-ignore - Fix when we fix types in compiler
  const response = span.output?.[0]?.content
  const duration =
    span.endTime && span.startTime
      ? new Date(span.endTime).getTime() - new Date(span.startTime).getTime()
      : undefined

  const costInMillicents =
    (span.inputCostInMillicents ?? 0) + (span.outputCostInMillicents ?? 0)
  const tokens = (span.inputTokens ?? 0) + (span.outputTokens ?? 0)
  const toolCalls = (span.output as CoreMessage[])
    .filter((message) => message.role === 'assistant')
    .flatMap((message: CoreAssistantMessage) =>
      typeof message.content === 'string'
        ? []
        : message.content.filter((c) => c.type === 'tool-call'),
    )
    .map((toolCall) => ({
      id: toolCall.toolCallId,
      name: toolCall.toolName,
      arguments: toolCall.args as Record<string, unknown>,
    }))

  await createDocumentLog({
    commit,
    data: {
      uuid: generateUUIDIdentifier(),
      documentUuid: document.documentUuid,
      parameters: span.parameters ?? {},
      resolvedContent: '',
      source: LogSources.API,
      duration,
      customIdentifier: span.distinctId ?? undefined,
      createdAt: new Date(),
      providerLog: {
        toolCalls,
        model: span.model ?? '',
        costInMillicents,
        duration,
        usage: {
          promptTokens: span.inputTokens ?? 0,
          completionTokens: span.outputTokens ?? 0,
          totalTokens: tokens,
        },
        // @ts-ignore - Fix when we fix types in compiler
        messages: span.input!,
        responseText:
          typeof response === 'string' ? response : JSON.stringify(response),
      },
    },
  }).then((r) => r.unwrap())
}
