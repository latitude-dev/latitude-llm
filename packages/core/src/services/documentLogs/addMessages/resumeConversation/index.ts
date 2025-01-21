import {
  Commit,
  ErrorableEntity,
  DocumentVersion,
  LogSources,
  Workspace,
} from '../../../../browser'
import { Result } from '../../../../lib'
import { runChain } from '../../../chains/run'
import { buildProvidersMap } from '../../../providerApiKeys/buildMap'
import { Message } from '@latitude-data/compiler'
import { Chain as PromptlChain } from 'promptl-ai'
import { getResolvedContent } from '../../../documents'
import { deleteCachedChain } from '../../../chains/chainCache'
import { ChainStepResponse, StreamType } from '../../../../constants'
import { runAgent } from '../../../chains/agents/run'

/**
 * What means to resume a converstation
 * ::::::::::::::::::::
 * When a paused/cached chain is found in our cache (Redis at the time of writing),
 * we asume is a paused and incompleted conversation.
 * To resume it we re-run it passing `extraMessages` that will be passed down to prompt
 * as response from the previous run.
 *
 * One use case is tool calling:
 * This is helpful for tool calling. Allow users to preprare tool responses when
 * AI returns a tool call. And Latitude add the tool request and tool response to the
 * conversation so next time AI runs have all the info necesary to continue the conversation.
 */
export async function resumeConversation({
  workspace,
  document,
  commit,
  documentLogUuid,
  pausedChain,
  responseMessages,
  previousResponse,
  source,
}: {
  workspace: Workspace
  commit: Commit
  document: DocumentVersion
  documentLogUuid: string
  pausedChain: PromptlChain
  responseMessages: Message[]
  previousResponse: ChainStepResponse<StreamType>
  source: LogSources
}) {
  const resultResolvedContent = await getResolvedContent({
    workspaceId: workspace.id,
    document,
    commit,
  })

  if (resultResolvedContent.error) return resultResolvedContent

  const resolvedContent = resultResolvedContent.value
  const errorableType = ErrorableEntity.DocumentLog
  const providersMap = await buildProvidersMap({
    workspaceId: workspace.id,
  })
  const errorableUuid = documentLogUuid

  // These are all the messages that the client
  // already have seen. So we don't want to send them again.
  const previousCount =
    pausedChain.globalMessagesCount + responseMessages.length

  const runFn = document.documentType === 'agent' ? runAgent : runChain

  const run = await runFn({
    generateUUID: () => errorableUuid,
    errorableType,
    workspace,
    chain: pausedChain,
    promptlVersion: document.promptlVersion,
    providersMap,
    source,
    previousCount,
    previousResponse,
    extraMessages: responseMessages,
  })

  return Result.ok({
    stream: run.stream,
    duration: run.duration,
    resolvedContent,
    errorableUuid,
    response: run.response.then(async (response) => {
      const isCompleted = response.value?.chainCompleted

      if (isCompleted) {
        // We delete cached chain so next time someone add a message to
        // this documentLogUuid it will simple add the message to the conversation.
        await deleteCachedChain({ workspace, documentLogUuid })
      }

      return response
    }),
  })
}
