import {
  runChain,
  SomeChain,
  RunChainArgs,
  ChainResponse,
  CachedApiKeys,
  createChainRunError,
  stepLimitExceededErrorMessage,
  buildPrevContent,
} from '../run'
import { generateUUIDIdentifier } from '../../../lib/generateUUID'
import {
  LatitudeChainCompleteEventData,
  LogSources,
} from '@latitude-data/constants'
import {
  MAX_STEPS_CONFIG_NAME,
  ErrorableEntity,
  DEFAULT_MAX_STEPS,
  ABSOLUTE_MAX_STEPS,
} from '../../../constants'
import {
  ChainEvent,
  ChainEventTypes,
  ChainStepResponse,
  StreamEventTypes,
  StreamType,
} from '../../../constants'
import { Conversation, Message } from '@latitude-data/compiler'
import {
  buildAllMessagesFromResponse,
  buildMessagesFromResponse,
  Workspace,
} from '../../../browser'
import { ChainStreamConsumer } from '../ChainStreamConsumer'
import { getCachedResponse, setCachedResponse } from '../../commits/promptCache'
import { validateAgentStep, ValidatedAgentStep } from './AgentStepValidator'
import {
  buildProviderLogDto,
  saveOrPublishProviderLogs,
} from '../ProviderProcessor/saveOrPublishProviderLogs'
import { ai } from '../../ai'
import { checkValidStream } from '../checkValidStream'
import { consumeStream } from '../ChainStreamConsumer/consumeStream'
import { processResponse } from '../ProviderProcessor'
import { Result } from '../../../lib'
import { ChainError } from '../ChainErrors'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import { Chain } from 'promptl-ai'
import { getToolCalls } from '../buildStep'
import { cacheChain } from '../chainCache'

type ChainCompleteEvent = {
  data: LatitudeChainCompleteEventData
  event: StreamEventTypes.Latitude
}
function isChainComplete(value: ChainEvent): value is ChainCompleteEvent {
  return (
    value.event === StreamEventTypes.Latitude &&
    value.data.type === ChainEventTypes.Complete
  )
}

export async function runAgent<T extends boolean, C extends SomeChain>({
  workspace,
  chain,
  promptlVersion,
  providersMap,
  source,
  errorableType,
  configOverrides,
  persistErrors = true,
  generateUUID = generateUUIDIdentifier,
  previousResponse: _previousResponse,
  extraMessages,
  ...other
}: RunChainArgs<T, C>) {
  const errorableUuid = generateUUID()

  let responseResolve: (value: ChainResponse<StreamType>) => void

  const response = new Promise<ChainResponse<StreamType>>((resolve) => {
    responseResolve = resolve
  })

  let conversation: Conversation
  let stepCount = 0
  let previousResponse = _previousResponse

  const chainResult = await runChain({
    workspace,
    chain,
    promptlVersion,
    providersMap,
    source,
    errorableType: errorableType as ErrorableEntity,
    configOverrides,
    persistErrors: persistErrors as true,
    generateUUID: () => errorableUuid,
    removeSchema: true, // Removes the schema configuration for the AI generation, as it is reserved for the agent's Return function
    previousResponse,
    extraMessages,
    ...other,
  })

  const chainStartTime = Date.now()
  const stream = new ReadableStream<ChainEvent>({
    start(controller) {
      const chainEventsReader = chainResult.stream.getReader()

      const readNextChainEvent = () => {
        chainEventsReader.read().then(({ done, value }) => {
          if (value) {
            if (isChainComplete(value)) {
              const messages = buildAllMessagesFromResponse({
                response: value.data.response,
              })
              conversation = {
                config: value.data.config,
                messages,
              }
              if (value.data.finishReason === 'tool-calls') {
                controller.enqueue(value)
                controller.close()
                return responseResolve(
                  Result.ok(
                    value.data.response as ChainStepResponse<StreamType>,
                  ),
                )
              }
            } else {
              // Forward all events that are not the ChainComplete event
              controller.enqueue(value)

              if (value.data.type === ChainEventTypes.StepComplete) {
                stepCount++
                previousResponse = value.data
                  .response as ChainStepResponse<StreamType>
              }
            }

            if (value.data.type === ChainEventTypes.Error) {
              return responseResolve(
                Result.error(value.data.error as ChainError<RunErrorCodes>),
              )
            }
          }

          if (!done) return readNextChainEvent()

          // Start agent's auntonomous workflow when initial chain is done
          runAgentStep({
            workspace,
            source,
            originalChain: chain as Chain,
            conversation,
            providersMap,
            controller,
            errorableUuid,
            errorableType,
            stepCount,
            previousCount: conversation.messages.length - 1,
            previousResponse: previousResponse!,
            extraMessages: stepCount === 0 ? extraMessages : undefined, // Only include extra messages if Chain did not already used them
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
        })
      }

      // Start reading the chain events
      readNextChainEvent()
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

async function obtainAgentResponse({
  controller,
  workspace,
  step,
  source,
  stepStartTime,
  errorableUuid,
}: {
  controller: ReadableStreamDefaultController
  workspace: Workspace
  step: ValidatedAgentStep
  source: LogSources
  stepStartTime: number
  errorableUuid: string
}) {
  const cachedResponse = await getCachedResponse({
    workspace,
    config: step.config,
    conversation: step.conversation,
  })

  if (cachedResponse) {
    const providerLog = await saveOrPublishProviderLogs({
      workspace,
      streamType: cachedResponse.streamType,
      finishReason: 'stop', // TODO: we probably should add a cached reason here
      chainCompleted: step.chainCompleted,
      data: buildProviderLogDto({
        workspace,
        source,
        provider: step.provider,
        conversation: step.conversation,
        stepStartTime,
        errorableUuid,
        response: cachedResponse as ChainStepResponse<StreamType>,
      }),
      saveSyncProviderLogs: true, // TODO: temp bugfix, it should only save last one syncronously
    })

    return {
      ...cachedResponse,
      providerLog,
      documentLogUuid: errorableUuid,
    } as ChainStepResponse<'text'>
  }

  const aiResult = await ai({
    messages: step.conversation.messages,
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

  const processedResponse = await processResponse({
    aiResult,
    apiProvider: step.provider,
    config: step.config,
    errorableUuid,
    messages: step.conversation.messages,
    source,
    workspace,
    startTime: stepStartTime,
    chainCompleted: step.chainCompleted,
    finishReason: consumedStream.finishReason,
  })

  const providerLog = await saveOrPublishProviderLogs({
    workspace,
    streamType: aiResult.type,
    finishReason: consumedStream.finishReason,
    chainCompleted: step.chainCompleted,
    data: buildProviderLogDto({
      workspace,
      source,
      provider: step.provider,
      conversation: step.conversation,
      stepStartTime,
      errorableUuid,
      response: processedResponse,
    }),
    saveSyncProviderLogs: true, // TODO: temp bugfix, shuold only save last one syncronously
  })

  const response = { ...processedResponse, providerLog }

  await setCachedResponse({
    workspace,
    config: step.config,
    conversation: step.conversation,
    response,
  })

  return response
}

async function runAgentStep({
  workspace,
  source,
  originalChain,
  conversation,
  providersMap,
  controller,
  previousCount: _previousCount = 0,
  previousResponse,
  errorableUuid,
  errorableType,
  stepCount,
  extraMessages,
}: {
  workspace: Workspace
  source: LogSources
  conversation: Conversation
  originalChain: Chain
  providersMap: CachedApiKeys
  controller: ReadableStreamDefaultController
  errorableUuid: string
  errorableType?: ErrorableEntity
  previousCount?: number
  previousResponse: ChainStepResponse<StreamType>
  stepCount: number
  extraMessages?: Message[]
}) {
  const { prevContent, previousCount } = buildPrevContent({
    previousResponse,
    extraMessages,
    previousCount: _previousCount,
  })

  const streamConsumer = new ChainStreamConsumer({
    controller,
    previousCount,
    errorableUuid,
  })

  try {
    const step = await validateAgentStep({
      workspace,
      prevContent,
      conversation,
      providersMap,
    }).then((r) => r.unwrap())

    if (previousResponse && step.chainCompleted) {
      streamConsumer.chainCompleted({
        step,
        response: previousResponse,
        finishReason: 'stop',
      })

      return previousResponse
    }

    const maxSteps = Math.min(
      (conversation.config[MAX_STEPS_CONFIG_NAME] as number | undefined) ??
        DEFAULT_MAX_STEPS,
      ABSOLUTE_MAX_STEPS,
    )
    if (maxSteps && stepCount >= maxSteps) {
      throw new ChainError({
        message: stepLimitExceededErrorMessage(maxSteps),
        code: RunErrorCodes.MaxStepCountExceededError,
      })
    }

    const { messageCount, stepStartTime } = streamConsumer.setup(step)

    const response = await obtainAgentResponse({
      controller,
      workspace,
      step,
      source,
      stepStartTime,
      errorableUuid,
    })

    streamConsumer.stepCompleted(response)

    const toolCalls = getToolCalls({ response })

    // Stop the chain if there are tool calls
    if (toolCalls.length) {
      await cacheChain({
        workspace,
        chain: originalChain,
        documentLogUuid: errorableUuid,
        previousResponse: response,
      })

      streamConsumer.chainCompleted({
        step,
        response,
        finishReason: 'tool-calls',
        responseMessages: buildMessagesFromResponse({
          response,
        }),
      })
    }

    // Stop the chain if completed
    if (step.chainCompleted) {
      streamConsumer.chainCompleted({
        step,
        response,
        finishReason: response.finishReason ?? 'stop',
      })

      return response
    }

    return runAgentStep({
      workspace,
      source,
      originalChain,
      conversation: step.conversation,
      errorableUuid,
      errorableType,
      providersMap,
      controller,
      previousCount: messageCount,
      previousResponse: response,
      stepCount: stepCount + 1,
    })
  } catch (e: unknown) {
    const error = streamConsumer.chainError(e)
    throw error
  }
}
