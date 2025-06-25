import {
  buildMessagesFromResponse,
  IntegrationDto,
  LogSources,
  PromptSource,
  Workspace,
} from '../../browser'
import {
  Message as LegacyMessage,
  ToolCall,
} from '@latitude-data/constants/legacyCompiler'
import { FinishReason, LanguageModelUsage } from 'ai'
import {
  ChainEvent,
  ChainEventTypes,
  ChainStepResponse,
  OmittedLatitudeEventData,
  StreamEventTypes,
  StreamType,
  VercelConfig,
} from '@latitude-data/constants'
import {
  createMcpClientManager,
  McpClientManager,
} from '../../services/integrations/McpClient/McpClientManager'
import { ChainError, RunErrorCodes } from '../errors'
import { generateUUIDIdentifier } from '../generateUUID'
import { createPromiseWithResolver } from './utils/createPromiseResolver'
import { ValidatedChainStep } from '../../services/chains/ChainValidator'
import { omit } from 'lodash-es'
import { ResolvedTools } from './resolveTools/types'

export type StreamManagerProps = {
  workspace: Workspace
  promptSource: PromptSource
  source: LogSources
  abortSignal?: AbortSignal
  uuid?: string
  messages?: LegacyMessage[]
  tokenUsage?: LanguageModelUsage
}

/**
 * StreamManager implements the Strategy pattern to handle different streaming approaches
 * for LLM responses. The base class provides common stream management functionality,
 * while concrete implementations (DefaultStreamManager, ChainStreamManager) implement
 * the specific strategies for their respective use cases.
 */
export abstract class StreamManager {
  public stream: ReadableStream<ChainEvent>
  public uuid: string
  public source: LogSources
  public mcpClientManager: McpClientManager

  protected controller?: ReadableStreamDefaultController<ChainEvent>
  protected messages: LegacyMessage[]
  protected promptSource: PromptSource
  protected workspace: Workspace
  protected error: ChainError<RunErrorCodes> | undefined
  protected abortSignal?: AbortSignal

  private inStep = false
  // TODO(compiler): review where we use this
  private resolveToolCalls?: (toolCalls: ToolCall[]) => void
  private tokenUsage: LanguageModelUsage
  private response: ChainStepResponse<StreamType> | undefined
  private finishReason?: FinishReason
  private resolveMessages?: (messages: LegacyMessage[]) => void
  private resolveError?: (error: ChainError<RunErrorCodes> | undefined) => void
  private resolveResponse?: (
    response: ChainStepResponse<StreamType> | undefined,
  ) => void

  constructor({
    workspace,
    promptSource,
    source,
    abortSignal,
    messages = [],
    uuid = generateUUIDIdentifier(),
    tokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
  }: StreamManagerProps) {
    this.uuid = uuid
    this.workspace = workspace
    this.messages = messages
    this.tokenUsage = tokenUsage
    this.promptSource = promptSource
    this.mcpClientManager = createMcpClientManager()
    this.source = source
    this.abortSignal = abortSignal
    this.stream = new ReadableStream<ChainEvent>({
      start: (controller) => {
        this.controller = controller
      },
    })

    this.handleAbortSignal(abortSignal)
  }

  /**
   * Sends an event to the client to inform it that an integration is waking up
   */
  wakingIntegration(integration: IntegrationDto) {
    this.sendEvent({
      type: ChainEventTypes.IntegrationWakingUp,
      integrationName: integration.name,
    })
  }

  /**
   * Ends the stream with an error
   */
  endWithError(error: Error) {
    if (!(error instanceof ChainError)) {
      error = new ChainError({
        code: RunErrorCodes.Unknown,
        message: (error as Error).message,
        details: (error as Error).stack
          ? { stack: (error as Error).stack! }
          : undefined,
      })
    }

    const e = error as ChainError<RunErrorCodes>

    this.sendEvent({
      type: ChainEventTypes.ChainError,
      error: {
        name: e.name,
        message: e.message,
        details: e.details,
        stack: e.stack,
      },
    })

    this.error = e
    this.endStream()
  }

  forwardEvent(event: ChainEvent) {
    if (!this.controller) throw new Error('Stream not started')
    if (event.event === StreamEventTypes.Provider) {
      this.controller.enqueue(event)
      return
    }
    if (event.data.uuid !== this.uuid) {
      throw new Error('Forwarded event has different errorableUuid')
    }

    this.messages = event.data.messages
    this.sendEvent(event.data)
  }

  prepare() {
    const { response, messages, toolCalls, error } =
      this.initializePromisedValues()

    return {
      stream: this.stream,
      response,
      messages,
      toolCalls,
      error,
      start: this.start.bind(this),
    }
  }

  private async start() {
    this.startStream()
    this.step()
  }

  abstract step(messages?: LegacyMessage[]): Promise<void>

  protected startStream() {
    this.sendEvent({ type: ChainEventTypes.ChainStarted })
  }

  protected startProviderStep(config: ValidatedChainStep['config']) {
    this.sendEvent({ type: ChainEventTypes.ProviderStarted, config })
  }

  protected async completeProviderStep({
    tokenUsage,
    response,
    finishReason,
  }: {
    tokenUsage: LanguageModelUsage
    response: ChainStepResponse<StreamType>
    finishReason?: Promise<FinishReason>
  }) {
    this.sendEvent({
      type: ChainEventTypes.ProviderCompleted,
      providerLogUuid: response.providerLog!.uuid,
      tokenUsage,
      finishReason: (await finishReason) ?? 'stop',
      response,
    })
  }

  protected startStep() {
    if (!this.controller) throw new Error('Stream not started')
    if (this.inStep)
      throw new Error(
        'Tried to start a new step without completing the previous one',
      )

    this.inStep = true
    this.sendEvent({
      type: ChainEventTypes.StepStarted,
    })
  }

  protected completeStep() {
    this.inStep = false
    this.sendEvent({
      type: ChainEventTypes.StepCompleted,
    })
  }

  protected transformPromptlToVercelToolDeclarations(
    config: ValidatedChainStep['config'],
    toolsBySource: ResolvedTools,
  ) {
    const tools = Object.fromEntries(
      Object.entries(toolsBySource).map(([name, { definition }]) => [
        name,
        definition,
      ]),
    )

    return {
      ...omit(config, 'tools', 'latitudeTools', 'agents'),
      ...(Object.keys(tools).length ? { tools } : {}),
    } as VercelConfig
  }

  protected endStream() {
    this.sendEvent({
      type: ChainEventTypes.ChainCompleted,
      finishReason: this.finishReason ?? 'stop',
      tokenUsage: this.tokenUsage,
    })

    this.resolveMessages?.(this.messages)
    this.resolveResponse?.(this.response)
    this.resolveError?.(this.error)
    // TODO(compiler): review this
    this.resolveToolCalls?.([])

    this.controller?.close()
  }

  protected sendEvent(event: OmittedLatitudeEventData) {
    if (!this.controller) throw new Error('Stream not started')

    this.controller.enqueue({
      event: StreamEventTypes.Latitude,
      data: {
        ...event,
        messages: this.messages,
        uuid: this.uuid,
      },
    })
  }

  protected handleAbortSignal(abortSignal?: AbortSignal) {
    abortSignal?.addEventListener(
      'abort',
      () => {
        this.endStream()
      },
      { once: true },
    )
  }

  protected initializePromisedValues() {
    const [messages, resolveMessages] =
      createPromiseWithResolver<LegacyMessage[]>()
    const [error, resolveError] = createPromiseWithResolver<
      ChainError<RunErrorCodes> | undefined
    >()
    const [toolCalls, resolveToolCalls] =
      createPromiseWithResolver<ToolCall[]>()
    const [response, resolveResponse] = createPromiseWithResolver<
      ChainStepResponse<StreamType> | undefined
    >()
    this.resolveToolCalls = resolveToolCalls
    this.resolveMessages = resolveMessages
    this.resolveError = resolveError
    this.resolveResponse = resolveResponse

    return { messages, response, toolCalls, error }
  }

  protected async updateStateFromResponse({
    response,
    tokenUsage,
    finishReason,
  }: {
    response: ChainStepResponse<StreamType>
    tokenUsage: LanguageModelUsage
    finishReason?: Promise<FinishReason>
  }) {
    this.addMessageFromResponse(response)
    this.response = response
    this.finishReason = await finishReason
    this.tokenUsage = {
      promptTokens: this.tokenUsage.promptTokens + tokenUsage.promptTokens,
      completionTokens:
        this.tokenUsage.completionTokens + tokenUsage.completionTokens,
      totalTokens: this.tokenUsage.totalTokens + tokenUsage.totalTokens,
    }
  }

  protected addMessageFromResponse(response: ChainStepResponse<StreamType>) {
    this.messages.push(...buildMessagesFromResponse({ response }))
  }
}

export { convertToLegacyChainStream } from './legacyStreamConverter'
