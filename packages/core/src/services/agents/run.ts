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
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { Conversation } from '@latitude-data/compiler'
import { runChain, SomeChain, RunChainArgs, ChainResponse } from '../chains/run'
import {
  ChainError,
  createChainRunError,
} from '../../lib/streamManager/ChainErrors'
import { runAgentStep } from './runStep'
import { deleteCachedChain } from '../chains/chainCache'

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
  extraMessages: _extraMessages,
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
  let extraMessages = _extraMessages

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
            if (value.data.type === ChainEventTypes.Error) {
              controller.enqueue(value)
              return responseResolve(
                Result.error(value.data.error as ChainError<RunErrorCodes>),
              )
            }

            if (isChainComplete(value)) {
              conversation = {
                config: value.data.config,
                messages: value.data.response.providerLog?.messages ?? [],
              }

              // Pause this process if the chain stopped due to tool calls
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
                extraMessages = undefined // extraMessages has been used by the Chain, so we no longer need it for the agent workflow
                previousResponse = value.data
                  .response as ChainStepResponse<StreamType>
              }
            }
          }

          if (!done) return readNextChainEvent()

          // Chain has been completed. Remove the cached chain if there was any.
          deleteCachedChain({ workspace, documentLogUuid: errorableUuid })

          // Start agent's auntonomous workflow when initial chain is done
          runAgentStep({
            workspace,
            source,
            conversation,
            providersMap,
            controller,
            errorableUuid,
            stepCount,
            previousCount: conversation.messages.length,
            previousResponse: previousResponse!,
            extraMessages,
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
