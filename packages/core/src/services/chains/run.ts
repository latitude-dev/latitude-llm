import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { Chain as PromptlChain } from 'promptl-ai'

import { ProviderApiKey, Workspace } from '../../browser'
import {
  ChainStepResponse,
  ErrorableEntity,
  LogSources,
  PromptSource,
  StreamType,
} from '../../constants'
import { ConfigOverrides } from './ChainValidator'
import { LanguageModelUsage } from 'ai'
import { MAX_STEPS_CONFIG_NAME } from '@latitude-data/constants'
import { TypedResult } from './../../lib/Result'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { Message as LegacyMessage } from '@latitude-data/constants/legacyCompiler'
import { ChainStreamManager } from '../../lib/streamManager/chainStreamManager'
import { generateUUIDIdentifier } from '../../lib/generateUUID'

export type CachedApiKeys = Map<string, ProviderApiKey>

export const stepLimitExceededErrorMessage = (maxSteps: number) =>
  `Limit of ${maxSteps} steps exceeded. Configure the '${MAX_STEPS_CONFIG_NAME}' setting in your prompt configuration to allow for more steps.`

export type ChainResponse<T extends StreamType> = TypedResult<
  ChainStepResponse<T>,
  ChainError<RunErrorCodes>
>
type CommonArgs<
  T extends boolean = true,
  C extends PromptlChain = PromptlChain,
> = {
  workspace: Workspace
  providersMap: CachedApiKeys
  source: LogSources
  promptlVersion: number
  chain: C
  promptSource: PromptSource

  mockClientToolResults?: boolean
  uuid?: string
  messages?: LegacyMessage[]
  newMessages?: LegacyMessage[]
  pausedTokenUsage?: LanguageModelUsage

  globalConfig: LatitudePromptConfig
  persistErrors?: T
  configOverrides?: ConfigOverrides
  removeSchema?: boolean

  abortSignal?: AbortSignal
}
export type RunChainArgs<
  T extends boolean,
  C extends PromptlChain,
> = T extends true
  ? CommonArgs<T, C> & {
      errorableType: ErrorableEntity
    }
  : CommonArgs<T, C> & { errorableType?: undefined }

export function runChain<T extends boolean, C extends PromptlChain>({
  workspace,
  providersMap,
  source,
  chain,
  messages,
  pausedTokenUsage,

  promptSource,
  abortSignal,
  mockClientToolResults = false,
  uuid = generateUUIDIdentifier(),

  // TODO(compiler): review these
  //globalConfig,
  //persistErrors = true,
  //errorableType,
  //configOverrides,
  //removeSchema = false,
}: RunChainArgs<T, C>) {
  const startTime = Date.now()

  const chainStreamManager = new ChainStreamManager({
    uuid,
    workspace,
    messages,
    tokenUsage: pausedTokenUsage,
    promptSource,
    providersMap,
    abortSignal,
    source,
    chain,
    mockClientToolResults
  })
  const { start, ...rest } = chainStreamManager.prepare()

  start()

  return {
    ...rest,
    uuid: chainStreamManager.uuid,
    resolvedContent: chain.rawText,
    // TODO: move duratino to chain manager
    duration: rest.response.then(() => Date.now() - startTime),
    conversation: {
      messages: rest.messages,
    },
  }
}
