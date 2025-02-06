import { Chain as LegacyChain, Message } from '@latitude-data/compiler'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import { Chain as PromptlChain } from 'promptl-ai'

import { ProviderApiKey, Workspace } from '../../browser'
import {
  ChainEvent,
  ChainStepResponse,
  ErrorableEntity,
  LogSources,
  MAX_STEPS_CONFIG_NAME,
  StreamType,
} from '../../constants'
import { Result, TypedResult } from '../../lib'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import {
  ChainError,
  createChainRunError,
} from '../../lib/streamManager/ChainErrors'
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
  workspace: Workspace
  chain: C
  promptlVersion: number
  source: LogSources
  providersMap: CachedApiKeys
  configOverrides?: ConfigOverrides
  generateUUID?: () => string
  persistErrors?: T
  removeSchema?: boolean
  extraMessages?: Message[]
  previousResponse?: ChainStepResponse<StreamType>
  previousCount?: number
}
export type RunChainArgs<
  T extends boolean,
  C extends SomeChain,
> = T extends true
  ? CommonArgs<T, C> & {
      errorableType: ErrorableEntity
    }
  : CommonArgs<T, C> & { errorableType?: undefined }

export async function runChain<T extends boolean, C extends SomeChain>({
  workspace,
  chain,
  promptlVersion,
  providersMap,
  source,
  errorableType,
  configOverrides,
  persistErrors = true,
  generateUUID = generateUUIDIdentifier,
  removeSchema = false,
  previousResponse,
  extraMessages,
  previousCount = 0,
}: RunChainArgs<T, C>) {
  const errorableUuid = generateUUID()

  let responseResolve: (value: ChainResponse<StreamType>) => void

  const response = new Promise<ChainResponse<StreamType>>((resolve) => {
    responseResolve = resolve
  })

  const chainStartTime = Date.now()
  const stream = new ReadableStream<ChainEvent>({
    start(controller) {
      // Recursive method:
      runStep({
        workspace,
        source,
        chain,
        promptlVersion,
        providersMap,
        controller,
        errorableUuid,
        configOverrides,
        removeSchema,
        previousResponse,
        extraMessages,
        previousCount,
      })
        .then((okResponse) => {
          responseResolve(Result.ok(okResponse))
        })
        .catch(async (e: ChainError<RunErrorCodes>) => {
          const error = await createChainRunError({
            error: e,
            errorableUuid,
            errorableType,
            persistErrors,
          })

          responseResolve(Result.error(error))
        })
    },
  })

  return {
    stream,
    response,
    resolvedContent: chain.rawText,
    errorableUuid,
    duration: response.then(() => Date.now() - chainStartTime),
  }
}
