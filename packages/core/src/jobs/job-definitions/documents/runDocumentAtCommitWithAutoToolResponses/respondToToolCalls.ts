import { Message, ToolCall } from '@latitude-data/compiler'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import {
  Commit,
  DocumentVersion,
  LogSources,
  Workspace,
} from '../../../../browser'
import { DocumentVersionsRepository } from '../../../../repositories'
import { getCachedChain } from '../../../../services/chains/chainCache'
import { resumePausedPrompt } from '../../../../services/documentLogs/addMessages/resumePausedPrompt'
import { getDocumentMetadata } from '../../../../services/documents'
import { TelemetryContext } from '../../../../telemetry'
import { Result } from './../../../../lib/Result'
import { UnprocessableEntityError } from './../../../../lib/errors'
import { generateToolResponseMessages } from './generateToolResponseMessages'
import { AutogenerateToolResponseCopilotData } from './getCopilotData'

export async function respondToToolCalls({
  context,
  workspace,
  commit,
  document,
  customPrompt,
  documentLogUuid,
  source,
  copilot,
  toolCalls,
}: {
  context: TelemetryContext
  workspace: Workspace
  commit: Commit
  document: DocumentVersion
  customPrompt?: string
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
    context,
    workspace,
    commit,
    document,
    customPrompt,
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
    context,
    workspace,
    commit,
    document,
    documentLogUuid,
    source,
    globalConfig: metadata.config as LatitudePromptConfig,
    pausedChain: cachedData.chain,
    previousResponse: cachedData.previousResponse,
    responseMessages: responseMessagesResult.value as unknown as Message[],
  })
}
