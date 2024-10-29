import { MessageRole } from '@latitude-data/compiler'
import { RunErrorCodes } from '@latitude-data/constants/errors'

import {
  ChainEvent,
  ChainEventTypes,
  ChainStepResponse,
  StreamEventTypes,
  StreamType,
} from '../../../constants'
import { objectToString } from '../../../helpers'
import { Config } from '../../ai'
import { ChainError } from '../ChainErrors'
import { ValidatedStep } from '../ChainValidator'

export function parseResponseText(response: ChainStepResponse<StreamType>) {
  if (response.streamType === 'object') return response.text || ''

  const text = response.text
  const hasTextResponse = text && text.length > 0
  if (hasTextResponse) return text

  if (!response?.toolCalls?.length) return text ?? ''

  const toolsString = objectToString(
    response.toolCalls,
    'Error parsing tool calls',
  )
  return `Tool calls requested: ${toolsString}`
}

export function enqueueChainEvent(
  controller: ReadableStreamDefaultController,
  event: ChainEvent,
) {
  controller.enqueue(event)
}

export const isChainError = (e: unknown): e is ChainError<RunErrorCodes> =>
  e instanceof ChainError

function parseError(e: unknown) {
  if (!isChainError(e)) {
    const error = e as Error
    return new ChainError({
      code: RunErrorCodes.Unknown,
      message: error.message,
      stack: error.stack,
    })
  }

  return e
}

export class ChainStreamConsumer {
  private controller: ReadableStreamDefaultController
  private previousCount: number
  private errorableUuid: string

  static chainCompleted({
    response,
    config,
    controller,
  }: {
    controller: ReadableStreamDefaultController
    response: ChainStepResponse<StreamType>
    config: Config
  }) {
    const content = parseResponseText(response)
    enqueueChainEvent(controller, {
      event: StreamEventTypes.Latitude,
      data: {
        type: ChainEventTypes.Complete,
        config,
        documentLogUuid: response.documentLogUuid,
        response,
        messages: [
          {
            role: MessageRole.assistant,
            toolCalls:
              response.streamType === 'text' ? response.toolCalls || [] : [],
            content,
          },
        ],
      },
    })

    controller.close()
  }

  static chainError({
    controller,
    e,
  }: {
    controller: ReadableStreamDefaultController
    e: unknown
  }) {
    const error = parseError(e)
    enqueueChainEvent(controller, {
      event: StreamEventTypes.Latitude,
      data: {
        type: ChainEventTypes.Error,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      },
    })
    controller.close()
    return error
  }

  constructor({
    controller,
    previousCount,
    errorableUuid,
  }: {
    controller: ReadableStreamDefaultController
    previousCount: number
    errorableUuid: string
  }) {
    this.controller = controller
    this.previousCount = previousCount
    this.errorableUuid = errorableUuid
  }

  setup(step: ValidatedStep) {
    const newMessages = step.conversation.messages.slice(this.previousCount)
    const messageCount = this.previousCount + newMessages.length
    enqueueChainEvent(this.controller, {
      data: {
        type: ChainEventTypes.Step,
        isLastStep: step.chainCompleted,
        config: step.conversation.config as Config,
        messages: newMessages,
        documentLogUuid: this.errorableUuid,
      },
      event: StreamEventTypes.Latitude,
    })
    return { messageCount, stepStartTime: Date.now() }
  }

  stepCompleted(response: ChainStepResponse<StreamType>) {
    enqueueChainEvent(this.controller, {
      event: StreamEventTypes.Latitude,
      data: {
        type: ChainEventTypes.StepComplete,
        documentLogUuid: response.documentLogUuid,
        response: response,
      },
    })
  }

  chainCompleted({
    step,
    response,
  }: {
    step: ValidatedStep
    response: ChainStepResponse<StreamType>
  }) {
    ChainStreamConsumer.chainCompleted({
      controller: this.controller,
      response,
      config: step.conversation.config as Config,
    })
  }

  chainError(e: unknown) {
    return ChainStreamConsumer.chainError({
      controller: this.controller,
      e,
    })
  }
}
