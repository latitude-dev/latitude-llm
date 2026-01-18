import { MessageRole } from '@latitude-data/constants/legacyCompiler'
import { database, Database } from '../../../client'
import {
  CompletionSpanMetadata,
  Message,
  PromptSpanMetadata,
  SerializedConversation,
  SerializedDocumentLog,
  Span,
  SpanType,
} from '../../../constants'
import { formatConversation } from '../../../helpers'
import { NotFoundError, UnprocessableEntityError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { SpanMetadatasRepository } from '../../../repositories'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { assembleTraceWithMessages } from '../traces/assemble'
import { adaptPromptlMessageToLegacy } from '../../../utils/promptlAdapter'

function formatMessages(messages: Message[]): SerializedConversation {
  messages = messages.map((message) => {
    if (Array.isArray(message.content)) {
      message.content = message.content.map((content) => {
        delete (content as any)?._promptlSourceMap
        return content
      })
    }
    return message
  })

  const filterMessages = (role: MessageRole) =>
    messages.filter((m) => m.role === role)

  const formatRoleMessages = (role: MessageRole) => {
    const roleMessages = filterMessages(role)
    return {
      all: roleMessages,
      first: roleMessages[0] || null,
      last: roleMessages[roleMessages.length - 1] || null,
    }
  }

  return {
    all: messages,
    first: messages[0] || null,
    last: messages[messages.length - 1] || null,
    user: formatRoleMessages(MessageRole.user),
    system: formatRoleMessages(MessageRole.system),
    assistant: formatRoleMessages(MessageRole.assistant),
  } as SerializedConversation
}

export async function serializeSpanAsDocumentLog(
  {
    span,
    workspace,
  }: {
    span: Span
    workspace: Workspace
  },
  db: Database = database,
): PromisedResult<SerializedDocumentLog> {
  const traceResult = await assembleTraceWithMessages(
    { traceId: span.traceId, workspace },
    db,
  )
  if (!Result.isOk(traceResult)) {
    return Result.error(traceResult.error)
  }

  const { completionSpan } = traceResult.unwrap()
  if (!completionSpan) {
    return Result.error(
      new NotFoundError('No completion span found in trace'),
    )
  }

  const completionMetadata = completionSpan.metadata as
    | CompletionSpanMetadata
    | undefined
  if (!completionMetadata) {
    return Result.error(
      new UnprocessableEntityError('Completion span metadata is missing'),
    )
  }

  const inputMessages = (completionMetadata.input || []).map(
    adaptPromptlMessageToLegacy,
  )
  const outputMessages = (completionMetadata.output || []).map(
    adaptPromptlMessageToLegacy,
  )
  const allMessages = [...inputMessages, ...outputMessages]

  const lastAssistantMessage = outputMessages.find(
    (m) => m.role === 'assistant',
  )
  const response =
    typeof lastAssistantMessage?.content === 'string'
      ? lastAssistantMessage.content
      : null

  const toolCalls =
    lastAssistantMessage?.toolCalls?.map((tc) => ({
      id: tc.id,
      name: tc.name,
      arguments: tc.arguments,
    })) ?? null

  const metadataRepo = new SpanMetadatasRepository(workspace.id)
  const promptMetadataResult = await metadataRepo.get<SpanType.Prompt>({
    spanId: span.id,
    traceId: span.traceId,
  })

  let template = ''
  let parameters: Record<string, unknown> = {}

  if (Result.isOk(promptMetadataResult)) {
    const promptMetadata = promptMetadataResult.unwrap() as PromptSpanMetadata
    template = promptMetadata.template ?? ''
    parameters = promptMetadata.parameters ?? {}
  }

  const tokens =
    (completionMetadata.tokens?.prompt ?? 0) +
    (completionMetadata.tokens?.completion ?? 0) +
    (completionMetadata.tokens?.cached ?? 0)

  return Result.ok({
    messages: formatMessages(allMessages),
    context: formatConversation(allMessages),
    toolCalls,
    response,
    config: completionMetadata.configuration ?? null,
    cost: (completionMetadata.cost ?? 0) / 1000,
    tokens,
    duration: span.duration / 1000,
    prompt: template,
    parameters,
  })
}
