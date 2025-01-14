import { ProviderLog, ToolCallResponse } from '@latitude-data/constants'
import { DocumentLog } from '../../../browser'
import { findLastProviderLogFromDocumentLogUuid } from '../../../data-access'
import { NotFoundError, Result, Transaction } from '../../../lib'
import { ContentType, MessageRole, ToolMessage } from '@latitude-data/compiler'
import { providerLogs } from '../../../schema'
import { database } from '../../../client'

export function buildToolResponseMessages(
  toolCallResponses: ToolCallResponse[],
): ToolMessage[] {
  return toolCallResponses.map((tool) => {
    let content: ToolMessage['content'] = []

    if (tool.text) {
      content = [
        {
          type: ContentType.text,
          text: tool.text,
        },
      ]
    }

    content.push({
      type: ContentType.toolResult,
      toolCallId: tool.id,
      toolName: tool.name,
      result:
        typeof tool.result === 'string' ? JSON.parse(tool.result) : tool.result,
      isError: tool.isError || false,
    })

    return {
      role: MessageRole.tool,
      content,
    }
  })
}

export async function addToolResponse(
  {
    documentLog,
    toolCallResponse,
  }: {
    documentLog: DocumentLog
    toolCallResponse: ToolCallResponse
  },
  db = database,
) {
  const providerLog = await findLastProviderLogFromDocumentLogUuid(
    documentLog.uuid,
  )

  if (!providerLog) {
    return Result.error(
      new NotFoundError(
        `Provider log not found for document log with uuid ${documentLog.uuid}`,
      ),
    )
  }

  let messages = providerLog.messages ?? []
  const toolResponseMessages = buildToolResponseMessages([toolCallResponse])
  messages = messages.concat(toolResponseMessages)

  return await Transaction.call<{
    providerLog: ProviderLog
    messages: ToolMessage[]
  }>(async (trx) => {
    const updates = await trx.update(providerLogs).set({ messages }).returning()
    const log = updates[0]! as ProviderLog

    return Result.ok({
      providerLog: log,
      messages: toolResponseMessages,
    })
  }, db)
}
