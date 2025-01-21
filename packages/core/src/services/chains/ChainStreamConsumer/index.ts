import { RunErrorCodes } from '@latitude-data/constants/errors'

import {
  ChainEvent,
  ChainEventTypes,
  ChainStepResponse,
  Message,
  StreamEventTypes,
  StreamType,
} from '../../../constants'
import { Config } from '../../ai'
import { ChainError } from '../ChainErrors'
import { ValidatedChainStep } from '../ChainValidator'
import { ValidatedAgentStep } from '../agents/AgentStepValidator'

type ValidatedStep = ValidatedChainStep | ValidatedAgentStep
import { FinishReason } from 'ai'
import { buildMessagesFromResponse } from '../../../helpers'

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
    finishReason,
    responseMessages,
  }: {
    controller: ReadableStreamDefaultController
    response: ChainStepResponse<StreamType>
    config: Config
    finishReason: FinishReason
    responseMessages: Message[]
  }) {
    enqueueChainEvent(controller, {
      event: StreamEventTypes.Latitude,
      data: {
        type: ChainEventTypes.Complete,
        config,
        documentLogUuid: response.documentLogUuid,
        response,
        messages: responseMessages,
        finishReason,
      },
    })

    controller.close()
  }

  static startStep({
    controller,
    config,
    messages,
    documentLogUuid,
    isLastStep = false,
  }: {
    controller: ReadableStreamDefaultController
    config: Config
    messages: Message[]
    documentLogUuid: string
    isLastStep?: boolean
  }) {
    enqueueChainEvent(controller, {
      data: {
        type: ChainEventTypes.Step,
        isLastStep,
        config,
        messages,
        documentLogUuid,
      },
      event: StreamEventTypes.Latitude,
    })
  }

  static stepCompleted({
    controller,
    response,
  }: {
    controller: ReadableStreamDefaultController
    response: ChainStepResponse<StreamType>
  }) {
    enqueueChainEvent(controller, {
      event: StreamEventTypes.Latitude,
      data: {
        type: ChainEventTypes.StepComplete,
        documentLogUuid: response.documentLogUuid,
        response: response,
      },
    })
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

    ChainStreamConsumer.startStep({
      controller: this.controller,
      config: step.conversation.config as Config,
      messages: newMessages,
      documentLogUuid: this.errorableUuid,
      isLastStep: step.chainCompleted,
    })

    return { messageCount, stepStartTime: Date.now() }
  }

  stepCompleted(response: ChainStepResponse<StreamType>) {
    ChainStreamConsumer.stepCompleted({
      controller: this.controller,
      response,
    })
  }

  chainCompleted({
    step,
    response,
    finishReason,
    responseMessages: defaultResponseMessages,
  }: {
    step: ValidatedStep
    response: ChainStepResponse<StreamType>
    finishReason: FinishReason
    responseMessages?: Message[]
  }) {
    const responseMessages =
      defaultResponseMessages ?? buildMessagesFromResponse({ response })
    return ChainStreamConsumer.chainCompleted({
      controller: this.controller,
      response,
      config: step.conversation.config as Config,
      finishReason,
      responseMessages,
    })
  }

  chainError(e: unknown) {
    return ChainStreamConsumer.chainError({
      controller: this.controller,
      e,
    })
  }
}
