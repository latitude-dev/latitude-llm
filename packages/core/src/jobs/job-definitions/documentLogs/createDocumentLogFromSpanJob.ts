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
  distinctId: string | undefined | null
  prompt: {
    commitUuid: string | undefined | null
    documentUuid: string
    parameters?: Record<string, unknown> | undefined
  }
}

export async function createDocumentLogFromSpanJob(
  job: Job<CreateDocumentLogFromSpanJobData>,
) {
  const { span, distinctId, prompt } = job.data
  if (span.internalType !== 'generation') return
  if (!prompt.documentUuid) return

  const workspace = await findWorkspaceFromSpan(span)
  if (!workspace) return

  const docsRepo = new DocumentVersionsRepository(workspace.id)
  const document = await docsRepo
    .getDocumentByUuid({
      documentUuid: prompt.documentUuid,
    })
    .then((r) => r.unwrap())
  if (!document) return

  const project = await findProjectFromDocument(document)
  if (!project) return

  const commit = await findCommitByUuid({
    projectId: project.id,
    uuid: prompt.commitUuid ?? HEAD_COMMIT,
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
      parameters: prompt.parameters ?? {},
      resolvedContent: '',
      source: LogSources.API,
      duration,
      customIdentifier: distinctId ?? undefined,
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
  })
}
