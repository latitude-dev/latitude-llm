import {
  ChainEvent,
  ChainEventTypes,
  ChainStepResponse,
  EMPTY_USAGE,
  OmittedLatitudeEventData,
  StreamEventTypes,
  StreamType,
  VercelConfig,
} from '@latitude-data/constants'
import {
  Message as LegacyMessage,
  ToolCall,
} from '@latitude-data/constants/legacyCompiler'
import { FinishReason } from 'ai'
import { LegacyVercelSDKVersion4Usage as LanguageModelUsage } from '@latitude-data/constants/ai'
import { omit } from 'lodash-es'
import { type ProviderApiKey } from '../../schema/models/types/ProviderApiKey'
import { type Workspace } from '../../schema/models/types/Workspace'
import { IntegrationDto } from '../../schema/models/types/Integration'
import { LogSources, PromptSource } from '../../constants'
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

const addTokens = ({
  attr,
  prev,
  next,
}: {
  attr: keyof LanguageModelUsage
  prev: LanguageModelUsage | undefined
  next: LanguageModelUsage
}) => (prev?.[attr] ?? 0) + next[attr]

export const incrementTokens = ({
  prev,
  next,
}: {
  prev: LanguageModelUsage | undefined
  next: LanguageModelUsage
}) => {
  return {
    inputTokens: addTokens({ attr: 'inputTokens', prev, next }),
    outputTokens: addTokens({ attr: 'outputTokens', prev, next }),
    promptTokens: addTokens({ attr: 'promptTokens', prev, next }),
    completionTokens: addTokens({ attr: 'completionTokens', prev, next }),
    totalTokens: addTokens({ attr: 'totalTokens', prev, next }),
    reasoningTokens: addTokens({ attr: 'reasoningTokens', prev, next }),
    cachedInputTokens: addTokens({ attr: 'cachedInputTokens', prev, next }),
  }
}

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
  public abortSignal?: AbortSignal

  public $context: TelemetryContext
  public $completion: ReturnType<typeof telemetry.completion> | undefined

  protected messages: LegacyMessage[]
  protected error: ChainError<RunErrorCodes> | undefined

  private startTime: number | undefined
  private endTime: number | undefined
  private resolveDuration?: (duration: number) => void
  private resolveToolCalls?: (toolCalls: ToolCall[]) => void
  private logUsage: LanguageModelUsage | undefined
  private runUsage: LanguageModelUsage | undefined
  private resolveLogUsage?: (usage: LanguageModelUsage) => void
  private resolveRunUsage?: (usage: LanguageModelUsage) => void
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
  }: StreamManagerProps) {
    this.uuid = uuid
    this.workspace = workspace
    this.messages = messages
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
    const {
      response,
      messages,
      toolCalls,
      error,
      duration,
      logUsage,
      runUsage,
    } = this.initializePromisedValues()

    return {
      response,
      messages,
      toolCalls,
      error,
      duration,
      logUsage,
      runUsage,
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

    const toolCalls = this.response?.providerLog?.toolCalls ?? []
    const tokenUsage = this.logUsage ?? EMPTY_USAGE()
    const duration = this.endTime! - this.startTime!
    const finishReason = this.finishReason ?? 'stop'
    const logUsage = this.logUsage ?? EMPTY_USAGE()
    const runUsage = this.runUsage ?? EMPTY_USAGE()

    // Send final stream event
    this.sendEvent({
      type: ChainEventTypes.ChainCompleted,
      response: this.response,
      toolCalls,
      finishReason,
      tokenUsage,
    })

    // Close the stream
    this.controller?.close()

    // Resolve the promised values
    this.resolveMessages?.(this.messages)
    this.resolveResponse?.(this.response)
    this.resolveError?.(this.error)
    this.resolveToolCalls?.(toolCalls)
    this.resolveDuration?.(duration)
    this.resolveLogUsage?.(logUsage)
    this.resolveRunUsage?.(runUsage)
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
      // TODO: add experiment uuid
      promptUuid:
        'document' in this.promptSource
          ? this.promptSource.document.documentUuid
          : undefined,
      versionUuid:
        'commit' in this.promptSource
          ? this.promptSource.commit.uuid
          : undefined,
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
        prompt: tokenUsage.promptTokens,
        cached: tokenUsage.cachedInputTokens,
        reasoning: tokenUsage.reasoningTokens,
        completion: tokenUsage.completionTokens,
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
      data: {
        ...event,
        timestamp: Date.now(),
        messages: this.messages,
        uuid: this.uuid,
      },
    })
  }

  protected handleAbortSignal(abortSignal?: AbortSignal) {
    abortSignal?.addEventListener(
      'abort',
      () => {
        this.endWithError(
          new ChainError({
            message: 'Stream aborted by user',
            code: RunErrorCodes.AbortError,
          }),
        )
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
    const [logUsage, resolveLogUsage] =
      createPromiseWithResolver<LanguageModelUsage>()
    const [runUsage, resolveRunUsage] =
      createPromiseWithResolver<LanguageModelUsage>()
    this.resolveToolCalls = resolveToolCalls
    this.resolveMessages = resolveMessages
    this.resolveError = resolveError
    this.resolveResponse = resolveResponse
    this.resolveDuration = resolveDuration
    this.resolveLogUsage = resolveLogUsage
    this.resolveRunUsage = resolveRunUsage

    return {
      messages,
      response,
      toolCalls,
      error,
      duration,
      logUsage,
      runUsage,
    }
  }

  protected incrementLogUsage(next: LanguageModelUsage) {
    this.logUsage = incrementTokens({ prev: this.logUsage, next })
  }

  incrementRunUsage(next: LanguageModelUsage) {
    this.runUsage = incrementTokens({ prev: this.runUsage, next })
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
    this.incrementLogUsage(tokenUsage)
    this.incrementRunUsage(tokenUsage)
  }

  protected setMessages(messages: LegacyMessage[]) {
    this.messages = messages
  }
}

export { convertToLegacyChainStream } from './legacyStreamConverter'
