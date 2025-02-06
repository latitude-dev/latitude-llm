import { Message, ToolCall } from '@latitude-data/compiler'
import {
  Commit,
  Workspace,
  DocumentVersion,
  LogSources,
} from '../../../../browser'
import { Result, UnprocessableEntityError } from '../../../../lib'
import { getCachedChain } from '../../../../services/chains/chainCache'
import { generateToolResponseMessages } from './generateToolResponseMessages'
import { AutogenerateToolResponseCopilotData } from './getCopilotData'
import { resumePausedPrompt } from '../../../../services/documentLogs/addMessages/resumePausedPrompt'

export async function respondToToolCalls({
  workspace,
  commit,
  document,
  documentLogUuid,
  source,
  copilot,
  toolCalls,
}: {
  workspace: Workspace
  commit: Commit
  document: DocumentVersion
  documentLogUuid: string
  source: LogSources
  copilot: AutogenerateToolResponseCopilotData
  toolCalls: ToolCall[]
}) {
  const cachedData = await getCachedChain({
    workspace,
    documentLogUuid,
  })

  if (!cachedData) {
    const toolCallString = JSON.stringify(toolCalls)
    return Result.error(
      new UnprocessableEntityError(
        'No cached chain found when calling with tool calls in a batch run document job',
        { toolCalls: toolCallString },
      ),
    )
  }

  const responseMessagesResult = await generateToolResponseMessages({
    workspace,
    commit,
    document,
    toolCalls,
    source,
    copilot,
  })

  if (responseMessagesResult.error) return responseMessagesResult

  return resumePausedPrompt({
    workspace,
    commit,
    document,
    documentLogUuid,
    source,
    pausedChain: cachedData.chain,
    previousResponse: cachedData.previousResponse,
    responseMessages: responseMessagesResult.value as unknown as Message[],
  })
}
