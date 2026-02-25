import {
  CompletionSpanMetadata,
  Message,
  PromptSpanMetadata,
  SpanType,
  ToolCall,
} from '../../../../constants'
import { Result, TypedResult } from '../../../../lib/Result'
import {
  DocumentVersionsRepository,
  SpanMetadatasRepository,
  SpansRepository,
} from '../../../../repositories'
import { assembleTraceWithMessages } from '../../../../services/tracing/traces/assemble'
import { WebhookPayload } from '../../../../services/webhooks/types'

export async function processSpanCreated({
  spanId,
  traceId,
  workspaceId,
}: {
  spanId: string
  traceId: string
  workspaceId: number
}): Promise<TypedResult<WebhookPayload, Error>> {
  const spansRepo = new SpansRepository(workspaceId)
  const spanResult = await spansRepo.get({ spanId, traceId })
  if (!spanResult.ok || !spanResult.value) {
    return Result.error(new Error('Span not found'))
  }
  const span = spanResult.value

  const metadataRepo = new SpanMetadatasRepository(workspaceId)
  const metadataResult = await metadataRepo.get<SpanType.Prompt>({
    spanId,
    traceId,
  })
  const metadata = metadataResult.ok
    ? (metadataResult.value as PromptSpanMetadata)
    : undefined

  let prompt = undefined
  if (span.documentUuid && span.commitUuid) {
    const docsRepo = new DocumentVersionsRepository(workspaceId)
    const docResult = await docsRepo.getDocumentByUuid({
      commitUuid: span.commitUuid,
      documentUuid: span.documentUuid,
    })
    if (docResult.ok && docResult.value) {
      prompt = docResult.value
    }
  }

  let messages: Message[] | undefined
  let toolCalls: ToolCall[] | undefined
  let response: string | undefined

  const traceResult = await assembleTraceWithMessages({
    traceId,
    workspace: { id: workspaceId },
    spanId,
    commitUuid: span.commitUuid,
    documentUuid: span.documentUuid,
    projectId: span.projectId,
  })

  if (traceResult.ok && traceResult.value) {
    const { completionSpan } = traceResult.value
    if (completionSpan?.metadata) {
      const completionMetadata =
        completionSpan.metadata as CompletionSpanMetadata
      messages = completionMetadata.input
      const outputMessages = completionMetadata.output

      if (outputMessages && outputMessages.length > 0) {
        response = extractResponseText(outputMessages)
        toolCalls = extractToolCalls(outputMessages)
      }
    }
  }

  // Return eventType as 'documentLogCreated' for backward compatibility
  return Result.ok({
    eventType: 'documentLogCreated',
    payload: {
      prompt,
      uuid: span.documentLogUuid,
      parameters: metadata?.parameters,
      customIdentifier: metadata?.externalId,
      duration: span.duration,
      source: span.source,
      commitUuid: span.commitUuid,
      messages,
      toolCalls,
      response,
    },
  })
}

function extractResponseText(messages: Message[]): string | undefined {
  for (const message of messages) {
    if (message.role !== 'assistant') continue

    for (const content of message.content) {
      if (content.type === 'text' && content.text) {
        return content.text
      }
    }
  }
  return undefined
}

function extractToolCalls(messages: Message[]): ToolCall[] | undefined {
  const toolCalls: ToolCall[] = []

  for (const message of messages) {
    if (message.role !== 'assistant') continue

    // Check deprecated toolCalls field first
    if (message.toolCalls && message.toolCalls.length > 0) {
      toolCalls.push(...message.toolCalls)
    }

    // Check content for tool-call items
    for (const content of message.content) {
      if (content.type === 'tool-call') {
        toolCalls.push({
          id: content.toolCallId,
          name: content.toolName,
          arguments: content.args,
        })
      }
    }
  }

  return toolCalls.length > 0 ? toolCalls : undefined
}
