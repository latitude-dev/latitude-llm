import { MAX_STEPS_CONFIG_NAME } from '@latitude-data/constants'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { Message as LegacyMessage } from '@latitude-data/constants/legacyCompiler'
import { LanguageModelUsage } from 'ai'
import { Chain as PromptlChain } from 'promptl-ai'
import { ProviderApiKey, Workspace } from '../../browser'
import {
  ChainStepResponse,
  LogSources,
  PromptSource,
  StreamType,
} from '../../constants'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { TypedResult } from '../../lib/Result'
import { ChainStreamManager } from '../../lib/streamManager/chainStreamManager'
import { ToolHandler } from '../../lib/streamManager/clientTools/handlers'
import { TelemetryContext } from '../../telemetry'

export type CachedApiKeys = Map<string, ProviderApiKey>

export const stepLimitExceededErrorMessage = (maxSteps: number) =>
  `Limit of ${maxSteps} steps exceeded. Configure the '${MAX_STEPS_CONFIG_NAME}' setting in your prompt configuration to allow for more steps.`

export type ChainResponse<T extends StreamType> = TypedResult<
  ChainStepResponse<T>,
  ChainError<RunErrorCodes>
>
type CommonArgs<C extends PromptlChain = PromptlChain> = {
  workspace: Workspace
  providersMap: CachedApiKeys
  source: LogSources
  chain: C
  promptSource: PromptSource

  context: TelemetryContext
  uuid?: string
  messages?: LegacyMessage[]
  pausedTokenUsage?: LanguageModelUsage

  memory?: { userId: string }
  tools?: Record<string, ToolHandler>
  abortSignal?: AbortSignal
}

export type RunChainArgs<C extends PromptlChain> = CommonArgs<C>

export function runChain<C extends PromptlChain>({
  context,
  workspace,
  providersMap,
  source,
  chain,
  messages,
  pausedTokenUsage,
  promptSource,
  abortSignal,
  memory,
  tools = {},
  uuid = generateUUIDIdentifier(),
}: RunChainArgs<C>) {
  const chainStreamManager = new ChainStreamManager({
    context,
    uuid,
    workspace,
    messages,
    tokenUsage: pausedTokenUsage,
    promptSource,
    providersMap,
    abortSignal,
    source,
    chain,
    tools,
    memory,
  })

  const { start, ...rest } = chainStreamManager.prepare()
  start()

  return {
    ...rest,
    uuid: chainStreamManager.uuid,
    resolvedContent: chain.rawText,
    conversation: {
      messages: rest.messages,
    },
  }
}
