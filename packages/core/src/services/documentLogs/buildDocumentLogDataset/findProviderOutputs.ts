import { Workspace } from '../../../browser'
import {
  DocumentLogWithMetadataAndError,
  ProviderLogsRepository,
} from '../../../repositories'
import { ContentType, Message, MessageContent } from '@latitude-data/compiler'
import { buildResponseMessage, ProviderLog } from '@latitude-data/constants'

export type ProviderOutput = { output: string; generatedAt: Date }

// This should never happen
const NO_RESPONSE_FOUND = 'NO RESPONSE FOUND'

function isJsonString(str: string) {
  try {
    JSON.parse(str)
    return true
  } catch (e) {
    return false
  }
}

function itemContentByType(item: MessageContent) {
  switch (item.type) {
    case ContentType.text:
      return item.text!
    case ContentType.image:
      return item.image.toString()
    case ContentType.file:
      return item.file.toString()
    case ContentType.toolCall:
      return JSON.stringify(item)
    case ContentType.toolResult:
      return JSON.stringify(item)
    default:
      return item
  }
}

function parseContentItem(item: MessageContent | string) {
  try {
    const content = typeof item === 'string' ? item : itemContentByType(item)
    const isJson = isJsonString(content)

    if (!isJson) return content

    return JSON.stringify(content, null, 2)
  } catch (e) {
    return NO_RESPONSE_FOUND
  }
}

function parseOutputFromMessage(message: Message) {
  const content = message.content
  if (typeof content === 'string' || !Array.isArray(content)) {
    return parseContentItem(content)
  }

  return content.map(parseContentItem).join('\n')
}

function getProviderLogOutput(providerLog: ProviderLog) {
  let responseMessage: Message | undefined

  if (providerLog.responseText) {
    responseMessage = buildResponseMessage({
      type: 'text',
      data: {
        text: providerLog.responseText,
        toolCalls: providerLog.toolCalls,
      },
    })
  } else {
    responseMessage = buildResponseMessage({
      type: 'object',
      data: {
        object: providerLog.responseObject,
        text: providerLog.responseText ?? undefined,
      },
    })
  }
  if (!responseMessage) return NO_RESPONSE_FOUND

  return parseOutputFromMessage(responseMessage)
}

export async function findProviderOutputs(
  workspace: Workspace,
  logs: DocumentLogWithMetadataAndError[]) {
  const repo = new ProviderLogsRepository(workspace.id)
  const providerLogs = await repo.findManyByDocumentLogUuid(
    logs.map((log) => log.uuid),
  )

  return providerLogs.reduce(
    (acc, providerLog) => {
      if (!providerLog.documentLogUuid) return acc
      if (providerLog.generatedAt === null) return acc

      const existing = acc.get(providerLog.documentLogUuid)

      if (existing && existing.generatedAt > providerLog.generatedAt) return acc

      const output = getProviderLogOutput(providerLog)

      acc.set(providerLog.documentLogUuid, {
        output,
        generatedAt: providerLog.generatedAt,
      })
      return acc
    },
    new Map() as Map<string, ProviderOutput>,
  )
}
