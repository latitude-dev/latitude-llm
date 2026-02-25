import { Message } from '@latitude-data/constants/messages'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import { SpanMetadatasRepository } from '../../repositories'
import { Workspace } from '../../schema/models/types/Workspace'
import { assembleTraceWithMessages } from '../../services/tracing/traces/assemble'
import { findCompletionSpanFromTrace } from '../../services/tracing/spans/fetching/findCompletionSpanFromTrace'
import { Conversation, fetchConversation } from './fetchConversation'
import {
  AssembledSpan,
  AssembledTrace,
  PromptSpanMetadata,
  SpanType,
} from '../../constants'

export type ConversationWithMessages = Conversation & {
  messages: Message[]
  traces: AssembledTrace[]
  promptName: string | null
  parameters: Record<string, unknown> | null
}

function findFirstPromptSpan(
  traces: AssembledTrace[],
): AssembledSpan | undefined {
  for (const trace of traces) {
    for (const span of trace.children) {
      if (span.type === SpanType.Prompt) {
        return span
      }
    }
  }
  return undefined
}

export async function fetchConversationWithMessages(
  {
    workspace,
    projectId,
    documentLogUuid,
    commitUuid,
    documentUuid,
  }: {
    workspace: Workspace
    projectId: number
    documentLogUuid: string
    commitUuid?: string
    documentUuid?: string
  },
  db = database,
) {
  const conversationResult = await fetchConversation(
    { workspace, projectId, documentLogUuid, commitUuid, documentUuid },
    db,
  )

  if (!conversationResult.ok || !conversationResult.value) {
    return Result.nil()
  }

  const conversation = conversationResult.value
  if (conversation.traceIds.length === 0) {
    return Result.ok<ConversationWithMessages>({
      ...conversation,
      messages: [],
      traces: [],
      promptName: null,
      parameters: null,
    })
  }

  const traces: AssembledTrace[] = []
  for (const traceId of conversation.traceIds) {
    const result = await assembleTraceWithMessages(
      { traceId, projectId, documentUuid, commitUuid, workspace },
      db,
    )
    if (result.ok && result.value) {
      traces.push(result.value.trace)
    }
  }

  traces.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())

  const lastTrace = traces[traces.length - 1]
  const completionSpan = findCompletionSpanFromTrace(lastTrace)
  const allMessages = completionSpan?.metadata
    ? [
        ...completionSpan.metadata.input,
        ...(completionSpan.metadata.output || []),
      ]
    : []

  const firstPromptSpan = findFirstPromptSpan(traces)
  let promptName: string | null = null
  let parameters: Record<string, unknown> | null = null

  if (firstPromptSpan) {
    promptName = firstPromptSpan.name
    const metadataRepo = new SpanMetadatasRepository(workspace.id)
    const metadataResult = await metadataRepo.get<SpanType.Prompt>({
      traceId: firstPromptSpan.traceId,
      spanId: firstPromptSpan.id,
    })
    if (metadataResult.ok && metadataResult.value) {
      const metadata = metadataResult.value as PromptSpanMetadata
      if ('parameters' in metadata) {
        parameters = metadata.parameters
      }
    }
  }

  return Result.ok<ConversationWithMessages>({
    ...conversation,
    messages: allMessages,
    traces,
    promptName,
    parameters,
  })
}
