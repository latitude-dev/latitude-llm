import { Message, ToolCall } from '@latitude-data/compiler'
import {
  Commit,
  Workspace,
  DocumentVersion,
  LogSources,
} from '../../../../browser'
import { getCachedChain } from '../../../../services/chains/chainCache'
import { generateToolResponseMessages } from './generateToolResponseMessages'
import { AutogenerateToolResponseCopilotData } from './getCopilotData'
import { resumePausedPrompt } from '../../../../services/documentLogs/addMessages/resumePausedPrompt'
import { DocumentVersionsRepository } from '../../../../repositories'
import { getDocumentMetadata } from '../../../../services/documents'
import { PromptConfig } from '@latitude-data/constants'
import { Result } from './../../../../lib/Result'
import { UnprocessableEntityError } from './../../../../lib/errors'

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

  if (responseMessagesResult.error) {
    return Result.error(responseMessagesResult.error)
  }

  const docsScope = new DocumentVersionsRepository(workspace.id)
  const allDocsResult = await docsScope.getDocumentsAtCommit(commit)
  if (allDocsResult.error) {
    return Result.error(allDocsResult.error)
  }

  const metadata = await getDocumentMetadata({
    document,
    getDocumentByPath: (path) =>
      allDocsResult.value.find((d) => d.path === path),
  })

  return resumePausedPrompt({
    workspace,
    commit,
    document,
    documentLogUuid,
    source,
    globalConfig: metadata.config as PromptConfig,
    pausedChain: cachedData.chain,
    previousResponse: cachedData.previousResponse,
    responseMessages: responseMessagesResult.value as unknown as Message[],
  })
}
