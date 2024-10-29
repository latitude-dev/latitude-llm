import { Chain } from '@latitude-data/compiler'
import { RunErrorCodes } from '@latitude-data/constants/errors'

import { ProviderApiKey, Workspace } from '../../browser'
import {
  ChainEvent,
  ChainStepResponse,
  ErrorableEntity,
  LogSources,
  StreamType,
} from '../../constants'
import { Result, TypedResult } from '../../lib'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { ai } from '../ai'
import { createRunError } from '../runErrors/create'
import { ChainError } from './ChainErrors'
import { ChainStreamConsumer } from './ChainStreamConsumer'
import { consumeStream } from './ChainStreamConsumer/consumeStream'
import { ChainValidator, ConfigOverrides } from './ChainValidator'
import { ProviderProcessor } from './ProviderProcessor'

export type CachedApiKeys = Map<string, ProviderApiKey>

async function handleError({
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

  const dbError = await createRunError({
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
type CommonArgs<T extends boolean = true> = {
  workspace: Workspace
  chain: Chain
  source: LogSources
  providersMap: CachedApiKeys
  configOverrides?: ConfigOverrides
  generateUUID?: () => string
  persistErrors?: T
}
type RunChainArgs<T extends boolean> = T extends true
  ? CommonArgs<T> & {
      errorableType: ErrorableEntity
    }
  : CommonArgs<T> & { errorableType?: undefined }

export async function runChain<T extends boolean>({
  workspace,
  chain,
  providersMap,
  source,
  errorableType,
  configOverrides,
  persistErrors = true,
  generateUUID = generateUUIDIdentifier,
}: RunChainArgs<T>) {
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
        providersMap,
        controller,
        errorableUuid,
        errorableType,
        configOverrides,
      })
        .then((okResponse) => {
          responseResolve(Result.ok(okResponse))
        })
        .catch(async (e: ChainError<RunErrorCodes>) => {
          const error = await handleError({
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

async function runStep({
  workspace,
  source,
  chain,
  providersMap,
  controller,
  previousCount = 0,
  previousResponse,
  errorableUuid,
  errorableType,
  configOverrides,
}: {
  workspace: Workspace
  source: LogSources
  chain: Chain
  providersMap: CachedApiKeys
  controller: ReadableStreamDefaultController
  errorableUuid: string
  errorableType?: ErrorableEntity
  previousCount?: number
  previousResponse?: ChainStepResponse<StreamType>
  configOverrides?: ConfigOverrides
}) {
  const prevText = previousResponse?.text
  const chainValidator = new ChainValidator({
    workspace,
    prevText,
    chain,
    providersMap,
    configOverrides,
  })
  const streamConsumer = new ChainStreamConsumer({
    controller,
    previousCount,
    errorableUuid,
  })

  try {
    const step = await chainValidator.call().then((r) => r.unwrap())
    const { messageCount, stepStartTime } = streamConsumer.setup(step)
    const providerProcessor = new ProviderProcessor({
      workspace,
      source,
      errorableUuid,
      config: step.config,
      apiProvider: step.provider,
      messages: step.conversation.messages,
      saveSyncProviderLogs: step.chainCompleted,
    })

    const aiResult = await ai({
      messages: step.conversation.messages,
      config: step.config,
      provider: step.provider,
      schema: step.schema,
      output: step.output,
    }).then((r) => r.unwrap())

    const consumedStream = await consumeStream({
      controller,
      result: aiResult,
    })
    const response = await providerProcessor
      .call({
        aiResult,
        finishReason: consumedStream.finishReason,
        startTime: stepStartTime,
      })
      .then((r) => r.unwrap())

    if (consumedStream.error) throw consumedStream.error
    if (step.chainCompleted) {
      streamConsumer.chainCompleted({ step, response })

      return response
    } else {
      streamConsumer.stepCompleted(response)
      return runStep({
        workspace,
        source,
        chain,
        errorableUuid,
        errorableType,
        providersMap,
        controller,
        previousCount: messageCount,
        previousResponse: response,
        configOverrides,
      })
    }
  } catch (e: unknown) {
    const error = streamConsumer.chainError(e)
    throw error
  }
}
