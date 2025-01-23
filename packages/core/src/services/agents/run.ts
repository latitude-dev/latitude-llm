import { LatitudeChainCompleteEventData } from '@latitude-data/constants'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import {
  ErrorableEntity,
  ChainEvent,
  ChainEventTypes,
  ChainStepResponse,
  StreamEventTypes,
  StreamType,
} from '../../constants'
import { Result } from '../../lib'
import { buildAllMessagesFromResponse } from '../../browser'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { Conversation } from '@latitude-data/compiler'
import { Chain } from 'promptl-ai'
import { runChain, SomeChain, RunChainArgs, ChainResponse } from '../chains/run'
import {
  ChainError,
  createChainRunError,
} from '../../lib/streamManager/ChainErrors'
import { runAgentStep } from './runStep'

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
