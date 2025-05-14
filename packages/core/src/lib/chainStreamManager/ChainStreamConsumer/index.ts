import { RunErrorCodes } from '@latitude-data/constants/errors'

import {
  LegacyChainEvent,
  LegacyChainEventTypes,
  ChainStepResponse,
  Message,
  StreamEventTypes,
  StreamType,
} from '../../../constants'
import { ChainError } from '../ChainErrors'
import { ValidatedChainStep } from '../../../services/chains/ChainValidator'
import { ValidatedAgentStep } from '../../../services/agents/AgentStepValidator'

type ValidatedStep = ValidatedChainStep | ValidatedAgentStep
import { FinishReason } from 'ai'
import { buildMessagesFromResponse } from '../../../helpers'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'

export function enqueueChainEvent(
  controller: ReadableStreamDefaultController,
  event: LegacyChainEvent,
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
      details: {
        stack: error.stack || '',
      },
    })
  }

  return e
}

export class ChainStreamConsumer {
  private controller: ReadableStreamDefaultController
  private previousCount: number
  private errorableUuid: string

  static startStep({
    controller,
    config,
    messages,
    documentLogUuid,
    isLastStep = false,
  }: {
    controller: ReadableStreamDefaultController
    config: LatitudePromptConfig
    messages: Message[]
    documentLogUuid: string
    isLastStep?: boolean
  }) {
    enqueueChainEvent(controller, {
      data: {
        type: LegacyChainEventTypes.Step,
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
        type: LegacyChainEventTypes.StepComplete,
        documentLogUuid: response.documentLogUuid,
        response: response,
      },
    })
  }

  static chainCompleted({
    response,
    config,
    controller,
    finishReason,
    responseMessages,
  }: {
    controller: ReadableStreamDefaultController
    response: ChainStepResponse<StreamType>
    config: LatitudePromptConfig
    finishReason: FinishReason
    responseMessages: Message[]
  }) {
    enqueueChainEvent(controller, {
      event: StreamEventTypes.Latitude,
      data: {
        type: LegacyChainEventTypes.Complete,
        config,
        documentLogUuid: response.documentLogUuid,
        response,
        messages: responseMessages,
        finishReason,
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
        type: LegacyChainEventTypes.Error,
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
      config: step.conversation.config as LatitudePromptConfig,
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
      config: step.conversation.config as LatitudePromptConfig,
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
