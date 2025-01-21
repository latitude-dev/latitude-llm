import {
  ContentType,
  MessageRole,
  type Message,
  type ToolMessage,
} from '@latitude-data/compiler'

import {
  AGENT_RETURN_TOOL_NAME,
  buildConversation,
  LogSources,
  Workspace,
} from '../../../browser'
import { addMessages as addMessagesProviderLog } from '../../providerLogs/addMessages'
import { ProviderLogsRepository } from '../../../repositories'
import { findPausedChain } from './findPausedChain'
import { resumeConversation } from './resumeConversation'
import { Result } from '../../../lib'
import serializeProviderLog from '../../providerLogs/serialize'

type CommonProps = {
  workspace: Workspace
  documentLogUuid: string | undefined
  messages: Message[]
  source: LogSources
}

function agentResponseMessages(messages: Message[]): Message[] {
  if (!messages.length) return []

  const lastMessage = messages[messages.length - 1]!
  if (lastMessage.role !== 'assistant') return []

  const agentFinishToolCall = lastMessage.toolCalls.find(
    (t) => t.name === AGENT_RETURN_TOOL_NAME,
  )

  if (!agentFinishToolCall) return []
  const agentFinishToolResult: ToolMessage = {
    role: MessageRole.tool,
    content: [
      {
        type: ContentType.toolResult,
        toolName: AGENT_RETURN_TOOL_NAME,
        toolCallId: agentFinishToolCall.id,
        isError: false,
        result: {},
      },
    ],
  }

  return [agentFinishToolResult]
}

async function addMessagesToCompleteChain({
  workspace,
  documentLogUuid,
  messages,
  source,
}: CommonProps) {
  const providerLogRepo = new ProviderLogsRepository(workspace.id)
  const providerLogResult =
    await providerLogRepo.findLastByDocumentLogUuid(documentLogUuid)
  if (providerLogResult.error) return providerLogResult

  const providerLog = providerLogResult.value

  messages = [
    ...buildConversation(serializeProviderLog(providerLog)),
    ...messages,
    ...agentResponseMessages(messages),
  ]

  return addMessagesProviderLog({ workspace, providerLog, messages, source })
}

export async function addMessages({
  workspace,
  documentLogUuid,
  messages,
  source,
}: {
  workspace: Workspace
  documentLogUuid: string | undefined
  messages: Message[]
  source: LogSources
}) {
  if (!documentLogUuid) {
    return Result.error(new Error('documentLogUuid is required'))
  }

  const foundResult = await findPausedChain({ workspace, documentLogUuid })

  if (!foundResult) {
    // No chain cached found means normal chat behavior
    return addMessagesToCompleteChain({
      workspace,
      documentLogUuid,
      messages,
      source,
    })
  }

  if (foundResult.error) return foundResult

  const pausedChainData = foundResult.value

  return resumeConversation({
    workspace,
    commit: pausedChainData.commit,
    document: pausedChainData.document,
    pausedChain: pausedChainData.pausedChain,
    documentLogUuid,
    responseMessages: messages,
    previousResponse: pausedChainData.previousResponse,
    source,
  })
}
