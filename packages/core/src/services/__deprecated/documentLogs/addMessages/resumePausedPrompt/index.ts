import { Message } from '@latitude-data/compiler'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { Chain as PromptlChain } from 'promptl-ai'
import {
  Commit,
  DocumentVersion,
  ErrorableEntity,
  LogSources,
  Workspace,
  buildMessagesFromResponse,
} from '../../../../../browser'
import {
  ChainStepResponse,
  DocumentType,
  StreamType,
} from '../../../../../constants'
import { TelemetryContext } from '../../../../../telemetry'
import { runAgent } from '../../../agents/run'
import { deleteCachedChain } from '../../../../chains/chainCache'
import { runChain } from '../../../chains/run'
import { getResolvedContent } from '../../../../documents'
import { buildProvidersMap } from '../../../../providerApiKeys/buildMap'
import { Result } from './../../../../../lib/Result'

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
  context,
  workspace,
  document,
  commit,
  globalConfig,
  documentLogUuid,
  pausedChain,
  responseMessages,
  previousResponse,
  source,
  abortSignal,
}: {
  context: TelemetryContext
  workspace: Workspace
  commit: Commit
  document: DocumentVersion
  globalConfig: LatitudePromptConfig
  documentLogUuid: string
  pausedChain: PromptlChain
  responseMessages: Message[]
  previousResponse: ChainStepResponse<StreamType>
  source: LogSources
  abortSignal?: AbortSignal
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
    context,
    generateUUID: () => errorableUuid,
    errorableType,
    workspace,
    chain: pausedChain,
    globalConfig,
    promptlVersion: document.promptlVersion,
    providersMap,
    source,
    promptSource: {
      document,
      commit,
    },
    // TODO(compiler): fix types
    // @ts-expect-error - TODO: fix types
    messages: previousResponse.providerLog!.messages,
    // TODO(compiler): fix types
    // @ts-expect-error - TODO: fix types
    newMessages: [
      ...buildMessagesFromResponse({ response: previousResponse }),
      ...responseMessages,
    ],
    abortSignal,
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
