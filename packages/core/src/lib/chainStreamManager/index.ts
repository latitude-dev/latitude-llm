import { Message, ToolCall } from '@latitude-data/compiler'
import { StreamEventTypes } from '@latitude-data/constants'
import { ChainEvent, ChainEventTypes, OmittedLatitudeEventData } from './events'
import { ExecuteStepArgs, streamAIResponse } from './step/streamAIResponse'
import { ChainStepResponse, StreamType } from '../../constants'
import { buildMessagesFromResponse } from '../../helpers'
import { FinishReason, LanguageModelUsage } from 'ai'

export class ChainStreamManager {
  private finished = false

  private tokenUsage: LanguageModelUsage
  private messages: Message[]
  private errorableUuid: string

  private resolveMessages?: (messages: Message[]) => void
  private controller?: ReadableStreamDefaultController<ChainEvent>
  private finishReason?: FinishReason

  constructor({
    errorableUuid,
    messages = [],
    tokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
  }: {
    errorableUuid: string
    messages?: Message[]
    tokenUsage?: LanguageModelUsage
  }) {
    this.messages = messages
    this.tokenUsage = tokenUsage
    this.errorableUuid = errorableUuid
  }

  /**
   * Starts the chain stream
   * @returns The stream, and a promise that resolves to the messages when the chain is done
   */
  start(cb?: () => Promise<void>): {
    stream: ReadableStream<ChainEvent>
    messages: Promise<Message[]>
  } {
    if (this.controller) throw new Error('Chain already started')
    if (this.finished) throw new Error('Chain already finished')

    const messages = new Promise<Message[]>((resolve) => {
      this.resolveMessages = resolve
    })

    const stream = new ReadableStream<ChainEvent>({
      start: (controller) => {
        this.controller = controller
        this.sendEvent({ type: ChainEventTypes.ChainStarted })

        cb?.()
          .then(() => !this.finished && this.done())
          .catch((error) => this.error(error))
      },
    })

    return {
      stream,
      messages: messages,
    }
  }

  /**
   * Generates the provider response, or fetches it from cache.
   *
   * Sends both StepStarted and StepCompleted events.
   */
  async getProviderResponse(args: Omit<ExecuteStepArgs, 'controller'>) {
    if (!this.controller) throw new Error('Stream not started')

    this.messages = args.conversation.messages // TODO: This may conflict with isolated steps

    this.sendEvent({ type: ChainEventTypes.StepStarted })

    this.sendEvent({
      type: ChainEventTypes.ProviderStarted,
      config: args.conversation.config,
    })

    const { response, tokenUsage } = await streamAIResponse({
      controller: this.controller,
      ...args,
    })
    this.addMessageFromResponse(response)

    this.finishReason = response.finishReason
    this.tokenUsage = {
      promptTokens: this.tokenUsage.promptTokens + tokenUsage.promptTokens,
      completionTokens:
        this.tokenUsage.completionTokens + tokenUsage.completionTokens,
      totalTokens: this.tokenUsage.totalTokens + tokenUsage.totalTokens,
    }

    this.sendEvent({
      type: ChainEventTypes.ProviderCompleted,
      providerLogUuid: response.providerLog!.uuid,
      tokenUsage,
      finishReason: response.finishReason ?? 'stop',
      _response: response,
    })

    this.sendEvent({ type: ChainEventTypes.StepCompleted })

    return response
  }

  /**
   * Ends the chain stream successfully
   */
  done() {
    if (this.finished) throw new Error('Chain already finished')
    this.sendEvent({
      type: ChainEventTypes.ChainCompleted,
      finishReason: this.finishReason ?? 'stop',
      tokenUsage: this.tokenUsage,
    })
    this.endStream()
  }

  /**
   * Ends the chain stream to request tools from the user
   */
  requestTools(tools: ToolCall[]) {
    this.sendEvent({
      type: ChainEventTypes.ToolsRequested,
      tools,
    })
    this.endStream()
  }

  /**
   * Ends the chain stream with an error
   */
  error(error: Error) {
    this.sendEvent({
      type: ChainEventTypes.ChainError,
      error,
    })
    this.endStream()
  }

  forwardEvent(event: ChainEvent) {
    if (!this.controller) throw new Error('Stream not started')
    if (event.event === StreamEventTypes.Provider) {
      this.controller.enqueue(event)
      return
    }

    if (event.data.documentLogUuid !== this.errorableUuid) {
      throw new Error('Forwarded event has different errorableUuid')
    }

    this.messages = event.data.messages
    this.sendEvent(event.data)
  }

  private addMessageFromResponse(response: ChainStepResponse<StreamType>) {
    this.messages.push(...buildMessagesFromResponse({ response }))
  }

  private sendEvent(event: OmittedLatitudeEventData) {
    if (!this.controller) throw new Error('Stream not started')
    this.controller.enqueue({
      event: StreamEventTypes.Latitude,
      data: {
        ...event,
        messages: this.messages,
        documentLogUuid: this.errorableUuid,
      },
    })
  }

  private endStream() {
    if (!this.controller) throw new Error('Stream not started')
    if (this.finished) throw new Error('Chain already finished')
    this.finished = true

    this.controller.close()
    this.resolveMessages?.(this.messages)
  }
}

export { convertToLegacyChainStream } from './legacyStreamConverter'
