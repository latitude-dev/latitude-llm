import {
  Conversation,
  Chain as LegacyChain,
  Message,
} from '@latitude-data/compiler'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import { Chain as PromptlChain } from 'promptl-ai'

import { ProviderApiKey, Workspace } from '../../browser'
import {
  ChainStepResponse,
  ErrorableEntity,
  LogSources,
  PromptSource,
  StreamType,
} from '../../constants'
import { TypedResult } from '../../lib'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import {
  ChainError,
  createChainRunError,
} from '../../lib/chainStreamManager/ChainErrors'
import { ConfigOverrides } from './ChainValidator'
import { runStep } from './runStep'
import { ChainStreamManager } from '../../lib/chainStreamManager'
import { LanguageModelUsage } from 'ai'
import { MAX_STEPS_CONFIG_NAME, PromptConfig } from '@latitude-data/constants'

export type CachedApiKeys = Map<string, ProviderApiKey>
export type SomeChain = LegacyChain | PromptlChain

export const stepLimitExceededErrorMessage = (maxSteps: number) =>
  `Limit of ${maxSteps} steps exceeded. Configure the '${MAX_STEPS_CONFIG_NAME}' setting in your prompt configuration to allow for more steps.`

export type ChainResponse<T extends StreamType> = TypedResult<
  ChainStepResponse<T>,
  ChainError<RunErrorCodes>
>
type CommonArgs<T extends boolean = true, C extends SomeChain = LegacyChain> = {
  workspace: Workspace
  providersMap: CachedApiKeys
  source: LogSources
  promptlVersion: number
  chain: C
  isChain?: boolean
  promptSource: PromptSource
  globalConfig: PromptConfig

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
      const conversation = await runStep({
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

      resolveConversation(conversation)
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
  }
}
