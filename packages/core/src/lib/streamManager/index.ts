import {
  IntegrationDto,
  LogSources,
  PromptSource,
  ProviderApiKey,
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
import { telemetry, TelemetryContext } from '../../telemetry'
import { ToolHandler } from './clientTools/handlers'

export type StreamManagerProps = {
  workspace: Workspace
  promptSource: PromptSource
  source: LogSources
  context: TelemetryContext
  abortSignal?: AbortSignal
  uuid?: string
  messages?: LegacyMessage[]
  tokenUsage?: LanguageModelUsage
  tools?: Record<string, ToolHandler>
}

/**
 * StreamManager implements the Strategy pattern to handle different streaming approaches
 * for LLM responses. The base class provides common stream management functionality,
 * while concrete implementations (DefaultStreamManager, ChainStreamManager) implement
 * the specific strategies for their respective use cases.
 */
export abstract class StreamManager {
  public controller?: ReadableStreamDefaultController<ChainEvent>
  public mcpClientManager: McpClientManager
  public promptSource: PromptSource
  public source: LogSources
  public stream: ReadableStream<ChainEvent>
  public tools: Record<string, ToolHandler>
  public uuid: string
  public workspace: Workspace

  public $context: TelemetryContext
  public $completion: ReturnType<typeof telemetry.completion> | undefined

  protected messages: LegacyMessage[]
  protected error: ChainError<RunErrorCodes> | undefined
  protected abortSignal?: AbortSignal

  private startTime: number | undefined
  private endTime: number | undefined
  private resolveDuration?: (duration: number) => void
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
    context,
    tools = {},
    messages = [],
    uuid = generateUUIDIdentifier(),
    tokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
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
    this.$context = context
    this.tools = tools
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

    this.$completion?.fail(e)

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
    const { response, messages, toolCalls, error, duration } =
      this.initializePromisedValues()

    return {
      response,
      messages,
      toolCalls,
      error,
      duration,
      stream: this.stream,
      start: this.start.bind(this),
    }
  }

  private async start() {
    this.startStream()
    this.step()
  }

  abstract step(messages?: LegacyMessage[]): Promise<void>

  protected startStream() {
    this.startTime = Date.now()
    this.sendEvent({ type: ChainEventTypes.ChainStarted })
  }

  protected endStream() {
    this.endTime = Date.now()

    // Resolve the promised values
    this.resolveMessages?.(this.messages)
    this.resolveResponse?.(this.response)
    this.resolveError?.(this.error)
    this.resolveToolCalls?.(this.response?.providerLog?.toolCalls ?? [])
    this.resolveDuration?.(this.endTime! - this.startTime!)

    this.sendEvent({
      type: ChainEventTypes.ChainCompleted,
      finishReason: this.finishReason ?? 'stop',
      tokenUsage: this.tokenUsage,
    })

    this.controller?.close()
  }

  protected startProviderStep({
    config,
    messages,
    provider,
  }: {
    config: ValidatedChainStep['config']
    messages: LegacyMessage[]
    provider: ProviderApiKey
  }) {
    this.$completion = telemetry.completion(this.$context, {
      configuration: config,
      input: messages,
      model: config.model,
      provider: provider.provider,
    })

    this.sendEvent({ type: ChainEventTypes.ProviderStarted, config })
  }

  protected async endProviderStep({
    responseMessages,
    tokenUsage,
    response,
    finishReason = 'stop',
  }: {
    responseMessages: LegacyMessage[]
    tokenUsage: LanguageModelUsage
    response: ChainStepResponse<StreamType>
    finishReason?: FinishReason
  }) {
    this.$completion?.end({
      output: responseMessages,
      tokens: {
        prompt: tokenUsage.inputTokens ?? 0,
        cached: 0, // Note: not given by Vercel AI SDK yet
        reasoning: 0, // Note: not given by Vercel AI SDK yet
        completion: tokenUsage.outputTokens ?? 0,
      },
      finishReason,
    })

    this.sendEvent({
      type: ChainEventTypes.ProviderCompleted,
      providerLogUuid: response.providerLog!.uuid,
      tokenUsage,
      finishReason,
      response,
    })
  }

  protected startStep() {
    this.sendEvent({
      type: ChainEventTypes.StepStarted,
    })
  }

  protected endStep() {
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

  protected sendEvent(event: OmittedLatitudeEventData) {
    if (!this.controller) throw new Error('Stream not started')

    this.controller.enqueue({
      event: StreamEventTypes.Latitude,
      // TODO(compiler)
      // @ts-expect-error - fix types
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
    const [duration, resolveDuration] = createPromiseWithResolver<number>()
    this.resolveToolCalls = resolveToolCalls
    this.resolveMessages = resolveMessages
    this.resolveError = resolveError
    this.resolveResponse = resolveResponse
    this.resolveDuration = resolveDuration

    return { messages, response, toolCalls, error, duration }
  }

  protected async updateStateFromResponse({
    response,
    messages,
    tokenUsage,
    finishReason,
  }: {
    response: ChainStepResponse<StreamType>
    messages: LegacyMessage[]
    tokenUsage: LanguageModelUsage
    finishReason?: FinishReason
  }) {
    this.messages.push(...messages)
    this.response = response
    this.finishReason = finishReason
    this.tokenUsage = this.sumTokenUsage(tokenUsage)
  }

  protected setMessages(messages: LegacyMessage[]) {
    this.messages = messages
  }

  protected sumTokenUsage(tokenUsage: LanguageModelUsage) {
    const newInputTokens = tokenUsage.inputTokens ?? 0
    const newOutputTokens = tokenUsage.outputTokens ?? 0
    const newTotalTokens = tokenUsage.totalTokens ?? 0
    const oldInputTokens = this.tokenUsage.inputTokens ?? 0
    const oldOutputTokens = this.tokenUsage.outputTokens ?? 0
    const oldTotalTokens = this.tokenUsage.totalTokens ?? 0
    return {
      inputTokens: oldInputTokens + newInputTokens,
      outputTokens: oldOutputTokens + newOutputTokens,
      totalTokens: oldTotalTokens + newTotalTokens,
    }
  }
}

export { convertToLegacyChainStream } from './legacyStreamConverter'
