import {
  Commit,
  ErrorableEntity,
  DocumentVersion,
  LogSources,
  Workspace,
  buildMessagesFromResponse,
} from '../../../../browser'
import { Result } from '../../../../lib'
import { runChain } from '../../../chains/run'
import { buildProvidersMap } from '../../../providerApiKeys/buildMap'
import { Message } from '@latitude-data/compiler'
import { Chain as PromptlChain } from 'promptl-ai'
import { getResolvedContent } from '../../../documents'
import { deleteCachedChain } from '../../../chains/chainCache'
import {
  ChainStepResponse,
  DocumentType,
  StreamType,
} from '../../../../constants'
import { runAgent } from '../../../agents/run'

/**
 * Resuming a prompt
 * ::::::::::::::::::::
 * A prompt can be paused by an unresolved tool call in any chain/agent step. Providing the tool
 * response will allow the chain to continue from where it was paused.
 *
 * A chain can only be cached if the original chain was not completed. If the chain was completed
 * but the autonomous workflow was paused, the chain will not be cached.
 *
 * A paused chain is cached in Redis. When a chain is resumed, the cached chain is
 * retrieved and the chain is run from the paused step.
 */
export async function resumePausedPrompt({
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

  const runFn =
    document.documentType === DocumentType.Agent ? runAgent : runChain

  const runResult = runFn({
    generateUUID: () => errorableUuid,
    errorableType,
    workspace,
    chain: pausedChain,
    promptlVersion: document.promptlVersion,
    providersMap,
    source,
    promptSource: {
      document,
      commit,
    },
    messages: previousResponse.providerLog!.messages, // TODO: Store this in the cache instead
    newMessages: [
      ...buildMessagesFromResponse({ response: previousResponse }),
      ...responseMessages,
    ],
  })

  return Result.ok({
    ...runResult,
    resolvedContent,
    errorableUuid,
    lastResponse: runResult.lastResponse.then(async (r) => {
      await deleteCachedChain({ workspace, documentLogUuid })
      return r
    }),
  })
}
