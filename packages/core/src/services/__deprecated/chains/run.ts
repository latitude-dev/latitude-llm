import {
  Conversation,
  Chain as LegacyChain,
  Message,
} from '@latitude-data/compiler'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { Chain as PromptlChain } from 'promptl-ai'

import { MAX_STEPS_CONFIG_NAME } from '@latitude-data/constants'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { LanguageModelUsage } from 'ai'
import { ChainStreamManager } from '../../../__deprecated/lib/chainStreamManager'
import { createChainRunError } from '../../../__deprecated/lib/chainStreamManager/ChainErrors'
import { ProviderApiKey, TraceContext, Workspace } from '../../../browser'
import {
  ChainStepResponse,
  ErrorableEntity,
  LogSources,
  PromptSource,
  StreamType,
} from '../../../constants'
import { generateUUIDIdentifier } from '../../../lib/generateUUID'
import { TypedResult } from '../../../lib/Result'
import { TelemetryContext } from '../../../telemetry'
import { ConfigOverrides } from './ChainValidator'
import { runStep } from './runStep'

export type CachedApiKeys = Map<string, ProviderApiKey>
export type SomeChain = LegacyChain | PromptlChain

export const stepLimitExceededErrorMessage = (maxSteps: number) =>
  `Limit of ${maxSteps} steps exceeded. Configure the '${MAX_STEPS_CONFIG_NAME}' setting in your prompt configuration to allow for more steps.`

export type ChainResponse<T extends StreamType> = TypedResult<
  ChainStepResponse<T>,
  ChainError<RunErrorCodes>
>
type CommonArgs<T extends boolean = true, C extends SomeChain = LegacyChain> = {
  context: TelemetryContext

  workspace: Workspace
  providersMap: CachedApiKeys
  source: LogSources
  promptlVersion: number
  chain: C
  isChain?: boolean
  promptSource: PromptSource
  globalConfig: LatitudePromptConfig

  persistErrors?: T
  generateUUID?: () => string
  messages?: Message[]
  newMessages?: Message[]
  pausedTokenUsage?: LanguageModelUsage

  configOverrides?: ConfigOverrides
  removeSchema?: boolean
  abortSignal?: AbortSignal
}
export type RunChainArgs<
  T extends boolean,
  C extends SomeChain,
> = T extends true
  ? CommonArgs<T, C> & {
      errorableType: ErrorableEntity
    }
  : CommonArgs<T, C> & { errorableType?: undefined }

export function runChain<T extends boolean, C extends SomeChain>({
  context,

  workspace,
  providersMap,
  source,
  promptlVersion,
  chain,
  globalConfig,

  persistErrors = true,
  generateUUID = generateUUIDIdentifier,
  errorableType,
  messages: pausedMessages,
  newMessages,
  pausedTokenUsage,

  configOverrides,
  removeSchema = false,
  promptSource,
  abortSignal,
  isChain = true,
}: RunChainArgs<T, C>) {
  const errorableUuid = generateUUID()
  const chainStartTime = Date.now()

  let resolveTrace: (trace: TraceContext) => void
  const trace = new Promise<TraceContext>((resolve) => {
    resolveTrace = resolve
  })

  // Conversation is returned for the Agent to use
  let resolveConversation: (conversation: Conversation) => void
  const conversation = new Promise<Conversation>((resolve) => {
    resolveConversation = resolve
  })

  const chainStreamManager = new ChainStreamManager({
    workspace,
    errorableUuid,
    messages: [...(pausedMessages ?? []), ...(newMessages ?? [])],
    tokenUsage: pausedTokenUsage,
    promptSource,
  })
  const streamResult = chainStreamManager.start(async () => {
    try {
      const result = await runStep({
        context,
        chainStreamManager,
        workspace,
        source,
        chain,
        promptlVersion,
        providersMap,
        errorableUuid,
        configOverrides,
        removeSchema,
        newMessages,
        previousConfig: globalConfig,
        abortSignal,
        injectAgentFinishTool: isChain === false,
      })

      resolveConversation(result.conversation)
      resolveTrace(result.trace)

      return result
    } catch (err) {
      const error = err as ChainError<RunErrorCodes>

      throw await createChainRunError({
        error,
        errorableUuid,
        errorableType,
        persistErrors,
      })
    }
  })

  return {
    ...streamResult,
    resolvedContent: chain.rawText,
    errorableUuid,
    duration: streamResult.messages.then(() => Date.now() - chainStartTime),
    conversation,
    trace,
  }
}
