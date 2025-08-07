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
  Message as LegacyMessage,
  ToolCall,
} from '@latitude-data/constants/legacyCompiler'
import { FinishReason, LanguageModelUsage } from 'ai'
import { omit } from 'lodash-es'
import {
  IntegrationDto,
  LogSources,
  PromptSource,
  Workspace,
} from '../../browser'
import { ValidatedChainStep } from '../../services/chains/ChainValidator'
import {
  createMcpClientManager,
  McpClientManager,
} from '../../services/integrations/McpClient/McpClientManager'
import { telemetry, TelemetryContext } from '../../telemetry'
import { ChainError, RunErrorCodes } from '../errors'
import { generateUUIDIdentifier } from '../generateUUID'
import { ToolHandler } from './clientTools/handlers'
import { ResolvedTools } from './resolveTools/types'
import { createPromiseWithResolver } from './utils/createPromiseResolver'

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
  public $step: ReturnType<typeof telemetry.step> | undefined

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

    this.$step?.fail(e)
    this.endStep()
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

  protected startProviderStep(config: ValidatedChainStep['config']) {
    this.sendEvent({ type: ChainEventTypes.ProviderStarted, config })
  }

  protected async endProviderStep({
    tokenUsage,
    response,
    finishReason = 'stop',
  }: {
    tokenUsage: LanguageModelUsage
    response: ChainStepResponse<StreamType>
    finishReason?: FinishReason
  }) {
    this.sendEvent({
      type: ChainEventTypes.ProviderCompleted,
      providerLogUuid: response.providerLog!.uuid,
      tokenUsage,
      finishReason,
      response,
    })
  }

  protected startStep() {
    this.$step = telemetry.step(this.$context)

    this.sendEvent({
      type: ChainEventTypes.StepStarted,
    })
  }

  protected endStep() {
    this.$step?.end()
    this.$step = undefined

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
    this.tokenUsage = {
      promptTokens: this.tokenUsage.promptTokens + tokenUsage.promptTokens,
      completionTokens:
        this.tokenUsage.completionTokens + tokenUsage.completionTokens,
      totalTokens: this.tokenUsage.totalTokens + tokenUsage.totalTokens,
    }
  }

  protected setMessages(messages: LegacyMessage[]) {
    this.messages = messages
  }
}

export { convertToLegacyChainStream } from './legacyStreamConverter'
