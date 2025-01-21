import { Chain as LegacyChain, Message } from '@latitude-data/compiler'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import { Chain as PromptlChain } from 'promptl-ai'

import {
  buildMessagesFromResponse,
  ProviderApiKey,
  Workspace,
} from '../../browser'
import {
  ABSOLUTE_MAX_STEPS,
  ChainEvent,
  ChainStepResponse,
  DEFAULT_MAX_STEPS,
  ErrorableEntity,
  LogSources,
  MAX_STEPS_CONFIG_NAME,
  StreamType,
} from '../../constants'
import { Result, TypedResult } from '../../lib'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { ai } from '../ai'
import { getCachedResponse, setCachedResponse } from '../commits/promptCache'
import { createRunError as createRunErrorFn } from '../runErrors/create'
import { ChainError } from './ChainErrors'
import { ChainStreamConsumer } from './ChainStreamConsumer'
import { consumeStream } from './ChainStreamConsumer/consumeStream'
import {
  ConfigOverrides,
  validateChain,
  ValidatedChainStep,
} from './ChainValidator'
import { checkValidStream } from './checkValidStream'
import { processResponse } from './ProviderProcessor'
import { buildStepExecution } from './buildStep'

export type CachedApiKeys = Map<string, ProviderApiKey>
export type SomeChain = LegacyChain | PromptlChain

export const stepLimitExceededErrorMessage = (maxSteps: number) =>
  `Limit of ${maxSteps} steps exceeded. Configure the '${MAX_STEPS_CONFIG_NAME}' setting in your prompt configuration to allow for more steps.`

export async function createChainRunError({
  error,
  errorableUuid,
  errorableType,
  persistErrors,
}: {
  errorableUuid: string
  error: ChainError<RunErrorCodes>
  persistErrors: boolean
  errorableType?: ErrorableEntity
}) {
  if (!persistErrors || !errorableType) return error

  const dbError = await createRunErrorFn({
    data: {
      errorableUuid,
      errorableType,
      code: error.errorCode,
      message: error.message,
      details: error.details,
    },
  }).then((r) => r.unwrap())

  error.dbError = dbError

  return error
}

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
      runStep({
        workspace,
        source,
        chain,
        promptlVersion,
        providersMap,
        controller,
        errorableUuid,
        errorableType,
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

function getNextStepCount({
  stepCount,
  chain,
  step,
}: {
  stepCount: number
  chain: SomeChain
  step: ValidatedChainStep
}) {
  const maxSteps = Math.min(
    (step.conversation.config[MAX_STEPS_CONFIG_NAME] as number | undefined) ??
      DEFAULT_MAX_STEPS,
    ABSOLUTE_MAX_STEPS,
  )
  const exceededMaxSteps =
    chain instanceof PromptlChain ? stepCount >= maxSteps : stepCount > maxSteps

  if (!exceededMaxSteps) return Result.ok(++stepCount)

  return Result.error(
    new ChainError({
      message: stepLimitExceededErrorMessage(maxSteps),
      code: RunErrorCodes.MaxStepCountExceededError,
    }),
  )
}

export type StepProps = {
  workspace: Workspace
  source: LogSources
  chain: SomeChain
  promptlVersion: number
  providersMap: CachedApiKeys
  controller: ReadableStreamDefaultController
  errorableUuid: string
  errorableType?: ErrorableEntity
  previousCount?: number
  previousResponse?: ChainStepResponse<StreamType>
  removeSchema?: boolean
  stepCount?: number
  extraMessages?: Message[]
  configOverrides?: ConfigOverrides
}

export function buildPrevContent({
  previousResponse,
  extraMessages,
  previousCount,
}: {
  previousResponse: StepProps['previousResponse']
  extraMessages: StepProps['extraMessages']
  previousCount: number
}) {
  if (!previousResponse) return { prevContent: undefined, previousCount }
  if (!extraMessages) {
    return {
      prevContent: previousResponse.text,
      previousCount: previousCount + 1,
    }
  }

  const prevContent = buildMessagesFromResponse({
    response: previousResponse,
  }).concat(...extraMessages)
  return { prevContent, previousCount: previousCount + prevContent.length }
}

export async function runStep({
  workspace,
  source,
  chain,
  promptlVersion,
  providersMap,
  controller,
  previousCount: _prevoiusCount = 0,
  previousResponse,
  errorableUuid,
  errorableType,
  configOverrides,
  removeSchema,
  extraMessages,
  stepCount = 0,
}: StepProps) {
  // When passed extra messages it means we are resuming a conversation
  const { prevContent, previousCount } = buildPrevContent({
    previousResponse,
    extraMessages,
    previousCount: _prevoiusCount,
  })

  const streamConsumer = new ChainStreamConsumer({
    controller,
    previousCount,
    errorableUuid,
  })

  try {
    const step = await validateChain({
      workspace,
      prevContent,
      chain,
      promptlVersion,
      providersMap,
      configOverrides,
      removeSchema,
    }).then((r) => r.unwrap())

    const messages = step.conversation.messages

    if (chain instanceof PromptlChain && step.chainCompleted) {
      streamConsumer.chainCompleted({
        step,
        response: previousResponse!,
        finishReason: previousResponse?.finishReason ?? 'stop',
      })

      previousResponse!.chainCompleted = true
      return previousResponse!
    }

    const nextStepCount = getNextStepCount({ stepCount, chain, step }).unwrap()

    const { messageCount, stepStartTime } = streamConsumer.setup(step)

    const cachedResponse = await getCachedResponse({
      workspace,
      config: step.config,
      conversation: step.conversation,
    })

    if (cachedResponse) {
      const { providerLog, executeStep } = await buildStepExecution({
        baseResponse: cachedResponse as ChainStepResponse<StreamType>,
        step,
        streamConsumer,
        providerLogProps: {
          streamType: cachedResponse.streamType,
          // NOTE: Before we were hardcoding `stop` when cached.
          finishReason: cachedResponse.finishReason ?? 'stop',
          stepStartTime,
        },
        stepProps: {
          workspace,
          source,
          chain,
          promptlVersion,
          providersMap,
          controller,
          errorableUuid,
          errorableType,
          previousCount: messageCount,
          previousResponse: cachedResponse as ChainStepResponse<StreamType>,
          configOverrides,
          stepCount: nextStepCount,
        },
      })

      const finalResponse = {
        ...cachedResponse,
        providerLog,
        documentLogUuid: errorableUuid,
      } as ChainStepResponse<StreamType>

      return executeStep({ finalResponse })
    }

    const aiResult = await ai({
      messages,
      config: step.config,
      provider: step.provider,
      schema: step.schema,
      output: step.output,
    }).then((r) => r.unwrap())
    const checkResult = checkValidStream(aiResult)

    if (checkResult.error) throw checkResult.error

    const consumedStream = await consumeStream({
      controller,
      result: aiResult,
    })

    if (consumedStream.error) throw consumedStream.error

    const _response = await processResponse({
      aiResult,
      apiProvider: step.provider,
      config: step.config,
      errorableUuid,
      messages,
      source,
      workspace,
      startTime: stepStartTime,
      finishReason: consumedStream.finishReason,
      chainCompleted: step.chainCompleted,
    })

    const { providerLog, executeStep } = await buildStepExecution({
      step,
      streamConsumer,
      baseResponse: _response,
      providerLogProps: {
        streamType: aiResult.type,
        finishReason: consumedStream.finishReason,
        stepStartTime,
      },
      stepProps: {
        workspace,
        source,
        chain,
        promptlVersion,
        errorableUuid,
        errorableType,
        providersMap,
        controller,
        previousCount: messageCount,
        previousResponse: _response,
        configOverrides,
        stepCount: nextStepCount,
      },
    })

    const finalResponse = { ..._response, providerLog }
    await setCachedResponse({
      workspace,
      config: step.config,
      conversation: step.conversation,
      response: finalResponse,
    })

    return executeStep({ finalResponse })
  } catch (e: unknown) {
    const error = streamConsumer.chainError(e)
    throw error
  }
}
