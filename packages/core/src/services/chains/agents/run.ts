import {
  runChain,
  SomeChain,
  RunChainArgs,
  ChainResponse,
  CachedApiKeys,
  createChainRunError,
} from '../run'
import { generateUUIDIdentifier } from '../../../lib/generateUUID'
import {
  LatitudeChainCompleteEventData,
  LogSources,
} from '@latitude-data/constants'
import { ErrorableEntity } from '../../../constants'
import {
  ChainEvent,
  ChainEventTypes,
  ChainStepResponse,
  StreamEventTypes,
  StreamType,
} from '../../../constants'
import { Conversation } from '@latitude-data/compiler'
import { buildMessagesFromResponse, Workspace } from '../../../browser'
import { ChainStreamConsumer } from '../ChainStreamConsumer'
import { getCachedResponse, setCachedResponse } from '../../commits/promptCache'
import { validateAgentStep } from './AgentStepValidator'
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
}: RunChainArgs<T, C>) {
  const errorableUuid = generateUUID()

  let responseResolve: (value: ChainResponse<StreamType>) => void

  const response = new Promise<ChainResponse<StreamType>>((resolve) => {
    responseResolve = resolve
  })

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
  })

  let conversation: Conversation

  const chainStartTime = Date.now()
  const stream = new ReadableStream<ChainEvent>({
    start(controller) {
      const chainEventsReader = chainResult.stream.getReader()

      const readNextChainEvent = () => {
        chainEventsReader.read().then(({ done, value }) => {
          if (value) {
            if (isChainComplete(value)) {
              const messages = buildMessagesFromResponse({
                response: value.data.response,
              })
              conversation = {
                config: value.data.config,
                messages,
              }
            } else {
              // Forward all events that are not the ChainComplete event
              controller.enqueue(value)
            }
          }

          if (!done) return readNextChainEvent()

          // Start agent's auntonomous workflow when initial chain is done
          runAgentStep({
            workspace,
            source,
            conversation,
            providersMap,
            controller,
            errorableUuid,
            errorableType,
            previousCount: conversation.messages.length - 1,
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

async function runAgentStep({
  workspace,
  source,
  conversation,
  providersMap,
  controller,
  previousCount = 0,
  previousResponse,
  errorableUuid,
  errorableType,
}: {
  workspace: Workspace
  source: LogSources
  conversation: Conversation
  providersMap: CachedApiKeys
  controller: ReadableStreamDefaultController
  errorableUuid: string
  errorableType?: ErrorableEntity
  previousCount?: number
  previousResponse?: ChainStepResponse<StreamType>
}) {
  const prevText = previousResponse?.text
  const streamConsumer = new ChainStreamConsumer({
    controller,
    previousCount,
    errorableUuid,
  })

  try {
    const step = await validateAgentStep({
      workspace,
      prevText,
      conversation,
      providersMap,
    }).then((r) => r.unwrap())

    if (previousResponse && step.chainCompleted) {
      streamConsumer.chainCompleted({
        step,
        response: previousResponse,
      })

      return previousResponse
    }

    const { messageCount, stepStartTime } = streamConsumer.setup(step)

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

      const response = {
        ...cachedResponse,
        providerLog,
        documentLogUuid: errorableUuid,
      } as ChainStepResponse<'text'>

      if (step.chainCompleted) {
        streamConsumer.chainCompleted({
          step,
          response,
        })

        return response
      } else {
        streamConsumer.stepCompleted(response)

        const responseMessages = buildMessagesFromResponse({ response })
        const nextConversation = {
          ...conversation,
          messages: responseMessages,
        }

        return runAgentStep({
          workspace,
          source,
          conversation: nextConversation,
          errorableUuid,
          errorableType,
          providersMap,
          controller,
          previousCount: messageCount,
          previousResponse: response,
        })
      }
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

    const _response = await processResponse({
      aiResult,
      apiProvider: step.provider,
      config: step.config,
      errorableUuid,
      messages: step.conversation.messages,
      source,
      workspace,
      startTime: stepStartTime,
    })

    const providerLog = await saveOrPublishProviderLogs({
      workspace,
      streamType: aiResult.type,
      finishReason: consumedStream.finishReason,
      data: buildProviderLogDto({
        workspace,
        source,
        provider: step.provider,
        conversation: step.conversation,
        stepStartTime,
        errorableUuid,
        response: _response,
      }),
      saveSyncProviderLogs: true, // TODO: temp bugfix, shuold only save last one syncronously
    })

    const response = { ..._response, providerLog }

    await setCachedResponse({
      workspace,
      config: step.config,
      conversation: step.conversation,
      response,
    })

    streamConsumer.stepCompleted(response)

    const responseMessages = buildMessagesFromResponse({ response })
    const nextConversation = {
      ...conversation,
      messages: responseMessages,
    }

    return runAgentStep({
      workspace,
      source,
      conversation: nextConversation,
      errorableUuid,
      errorableType,
      providersMap,
      controller,
      previousCount: messageCount,
      previousResponse: response,
    })
  } catch (e: unknown) {
    const error = streamConsumer.chainError(e)
    throw error
  }
}
