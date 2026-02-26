import {
  ChainEvent,
  ChainEventTypes,
  ChainStepResponse,
  EMPTY_USAGE,
  LatitudeEventData,
  OmittedLatitudeEventData,
  Providers,
  StreamEventTypes,
  StreamType,
  VercelConfig,
} from '@latitude-data/constants'
import { LegacyVercelSDKVersion4Usage as LanguageModelUsage } from '@latitude-data/constants/ai'
import type { Message, ToolCall } from '@latitude-data/constants/messages'
import type { SimulationSettings } from '@latitude-data/constants/simulation'
import { ResolvedToolsDict } from '@latitude-data/constants/tools'
import { FinishReason } from 'ai'
import { omit } from 'lodash-es'
import {
  CostBreakdown,
  mergeCostBreakdown,
} from '@latitude-data/constants/costs'
import { LogSources, PromptSource } from '../../constants'
import { DocumentVersionsRepository } from '../../repositories'
import { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { IntegrationDto } from '../../schema/models/types/Integration'
import { ProviderApiKey } from '../../schema/models/types/ProviderApiKey'
import { WorkspaceDto } from '../../schema/models/types/Workspace'
import { estimateCostBreakdown } from '../../services/ai/estimateCost'
import { ValidatedChainStep } from '../../services/chains/ChainValidator'
import { ToolHandler } from '../../services/documents/tools/clientTools/handlers'
import { lookupTools } from '../../services/documents/tools/lookup'
import { resolveTools } from '../../services/documents/tools/resolve'
import {
  createMcpClientManager,
  McpClientManager,
} from '../../services/integrations/McpClient/McpClientManager'
import { TelemetryContext } from '../../telemetry'
import { ChainError, LatitudeError, RunErrorCodes } from '../errors'
import { generateUUIDIdentifier } from '../generateUUID'
import { Result } from '../Result'
import { PromisedResult } from '../Transaction'
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

type OmittedLatitudeEventDataWithoutProviderLog =
  OmittedLatitudeEventData extends infer EventData
    ? EventData extends { providerLogUuid: string }
      ? Omit<EventData, 'providerLogUuid'>
      : EventData
    : never

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
  workspace: WorkspaceDto
  promptSource: PromptSource
  source: LogSources
  context: TelemetryContext
  abortSignal?: AbortSignal
  uuid?: string
  messages?: Message[]
  appendMessages?: Message[]
  tokenUsage?: LanguageModelUsage
  tools?: Record<string, ToolHandler>
  mcpHeaders?: Record<string, Record<string, string>>
  simulationSettings?: SimulationSettings
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
  public mcpHeaders?: Record<string, Record<string, string>>
  public promptSource: PromptSource
  public source: LogSources
  public stream: ReadableStream<ChainEvent>
  public tools: Record<string, ToolHandler>
  public uuid: string
  public workspace: WorkspaceDto
  public abortSignal?: AbortSignal
  public readonly simulationSettings?: SimulationSettings

  public $context: TelemetryContext

  protected messages: Message[]
  protected error: ChainError<RunErrorCodes> | undefined
  private isStreamEnded: boolean = false

  private startTime: number | undefined
  private endTime: number | undefined
  private resolveDuration?: (duration: number) => void
  private resolveToolCalls?: (toolCalls: ToolCall[]) => void
  /**
   * `logUsage` tracks only the tokens of the main agent in this interaction (excludes sub-agents).
   */
  private logUsage: LanguageModelUsage | undefined
  /**
   * `runUsage` tracks all tokens of this prompt and of all their sub-agents in this interaction.
   */
  private runUsage: LanguageModelUsage | undefined
  private resolveLogUsage?: (usage: LanguageModelUsage) => void
  private resolveRunUsage?: (usage: LanguageModelUsage) => void
  /**
   * `logCost` tracks only the cost of the main agent in this interaction (excludes sub-agents).
   */
  private logCost: CostBreakdown = {}
  /**
   * `runCost` tracks all costs of this prompt and of all their sub-agents in this interaction.
   */
  private runCost: CostBreakdown = {}
  private resolveLogCost?: (cost: CostBreakdown) => void
  private resolveRunCost?: (cost: CostBreakdown) => void
  private response: ChainStepResponse<StreamType> | undefined
  private finishReason?: FinishReason
  private resolveMessages?: (messages: Message[]) => void
  private resolveError?: (error: ChainError<RunErrorCodes> | undefined) => void
  private resolveResponse?: (
    response: ChainStepResponse<StreamType> | undefined,
  ) => void
  protected provider?: ProviderApiKey
  protected model?: string
  private resolveProvider?: (provider: ProviderApiKey | undefined) => void

  constructor({
    workspace,
    promptSource,
    source,
    abortSignal,
    context,
    tools = {},
    mcpHeaders,
    messages = [],
    uuid = generateUUIDIdentifier(),
    simulationSettings,
  }: StreamManagerProps) {
    this.uuid = uuid
    this.workspace = workspace
    this.messages = messages
    this.promptSource = promptSource
    this.mcpClientManager = createMcpClientManager()
    this.mcpHeaders = mcpHeaders
    this.source = source
    this.abortSignal = abortSignal
    this.$context = context
    this.tools = tools
    this.simulationSettings = simulationSettings
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
    const {
      response,
      messages,
      toolCalls,
      error,
      duration,
      logUsage,
      runUsage,
      logCost,
      runCost,
      provider,
    } = this.initializePromisedValues()

    return {
      response,
      messages,
      toolCalls,
      error,
      duration,
      logUsage,
      runUsage,
      logCost,
      runCost,
      provider,
      stream: this.stream,
      start: this.start.bind(this),
    }
  }

  private async start() {
    this.startStream()
    this.step()
  }

  abstract step(messages?: Message[]): Promise<void>

  protected startStream() {
    this.startTime = Date.now()
    this.sendEvent({ type: ChainEventTypes.ChainStarted })
  }

  protected endStream() {
    if (this.isStreamEnded) return
    this.isStreamEnded = true

    this.endTime = Date.now()

    const toolCalls =
      this.response && 'toolCalls' in this.response
        ? (this.response.toolCalls ?? [])
        : []
    const tokenUsage = this.logUsage ?? EMPTY_USAGE()
    const duration = this.endTime! - this.startTime!
    const finishReason = this.finishReason ?? 'stop'
    const logUsage = this.logUsage ?? EMPTY_USAGE()
    const runUsage = this.runUsage ?? EMPTY_USAGE()
    const logCost = this.logCost
    const runCost = this.runCost

    this.sendEvent({
      type: ChainEventTypes.ChainCompleted,
      response: this.response,
      toolCalls,
      finishReason,
      tokenUsage,
    })

    this.closeController()

    this.resolveMessages?.(this.messages)
    this.resolveResponse?.(this.response)
    this.resolveError?.(this.error)
    this.resolveToolCalls?.(toolCalls)
    this.resolveDuration?.(duration)
    this.resolveLogUsage?.(logUsage)
    this.resolveRunUsage?.(runUsage)
    this.resolveLogCost?.(logCost)
    this.resolveRunCost?.(runCost)
    this.resolveProvider?.(this.provider)
  }

  protected async startProviderStep({
    config,
    provider,
  }: {
    config: ValidatedChainStep['config']
    provider: ValidatedChainStep['provider']
  }) {
    this.provider = provider
    this.model = config.model
    this.sendEvent({ type: ChainEventTypes.ProviderStarted, config })
  }

  protected endProviderStep({
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
    toolsBySource: ResolvedToolsDict,
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

  protected getConversationContext() {
    if ('commit' in this.promptSource) {
      return {
        commitUuid: this.promptSource.commit.uuid,
        documentUuid: this.promptSource.document.documentUuid,
      }
    }

    return undefined
  }

  protected sendEvent(event: OmittedLatitudeEventDataWithoutProviderLog) {
    try {
      this.controller?.enqueue({
        event: StreamEventTypes.Latitude,
        data: {
          ...event,
          timestamp: Date.now(),
          messages: this.messages,
          uuid: this.uuid,
          providerLogUuid: '',
          source: {
            documentUuid:
              'document' in this.promptSource
                ? this.promptSource.document.documentUuid
                : undefined,
            commitUuid:
              'commit' in this.promptSource
                ? this.promptSource.commit.uuid
                : undefined,
            evaluationUuid:
              'uuid' in this.promptSource ? this.promptSource.uuid : undefined,
          },
        } as LatitudeEventData,
      })
    } catch (_) {
      // Controller may already be closed
    }
  }

  private closeController() {
    try {
      this.controller?.close()
    } catch (_) {
      // Controller may already be closed
    }
  }

  protected async getToolsBySource(
    config: ValidatedChainStep['config'],
  ): PromisedResult<ResolvedToolsDict, LatitudeError> {
    let documents: DocumentVersion[] = []
    let documentUuid: string = ''

    if ('commit' in this.promptSource) {
      const documentScope = new DocumentVersionsRepository(this.workspace.id)
      const documentsResult = await documentScope.getDocumentsAtCommit(
        this.promptSource.commit,
      )
      if (!Result.isOk(documentsResult)) return documentsResult

      documents = documentsResult.unwrap()
      documentUuid = this.promptSource.document.documentUuid
    }

    const toolsManifestResult = await lookupTools({
      config,
      documentUuid,
      documents,
      workspace: this.workspace,
    })

    if (toolsManifestResult.error) return toolsManifestResult
    const toolManifestDict = toolsManifestResult.unwrap()

    return resolveTools({
      toolManifestDict,
      streamManager: this,
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
    const [messages, resolveMessages] = createPromiseWithResolver<Message[]>()
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
    const [logCost, resolveLogCost] = createPromiseWithResolver<CostBreakdown>()
    const [runCost, resolveRunCost] = createPromiseWithResolver<CostBreakdown>()
    const [provider, resolveProvider] = createPromiseWithResolver<
      ProviderApiKey | undefined
    >()
    this.resolveToolCalls = resolveToolCalls
    this.resolveMessages = resolveMessages
    this.resolveError = resolveError
    this.resolveResponse = resolveResponse
    this.resolveDuration = resolveDuration
    this.resolveLogUsage = resolveLogUsage
    this.resolveRunUsage = resolveRunUsage
    this.resolveLogCost = resolveLogCost
    this.resolveRunCost = resolveRunCost
    this.resolveProvider = resolveProvider

    return {
      messages,
      response,
      toolCalls,
      error,
      duration,
      logUsage,
      runUsage,
      logCost,
      runCost,
      provider,
    }
  }

  protected incrementLogUsage(next: LanguageModelUsage) {
    this.logUsage = incrementTokens({ prev: this.logUsage, next })
  }

  incrementRunUsage(next: LanguageModelUsage) {
    this.runUsage = incrementTokens({ prev: this.runUsage, next })
  }

  protected incrementLogCost({
    provider,
    model,
    usage,
  }: {
    provider: Providers
    model: string
    usage: LanguageModelUsage
  }) {
    const costBreakdown = estimateCostBreakdown({ provider, model, usage })
    this.logCost = mergeCostBreakdown(this.logCost, costBreakdown)
  }

  protected incrementRunCostFromUsage({
    provider,
    model,
    usage,
  }: {
    provider: Providers
    model: string
    usage: LanguageModelUsage
  }) {
    const costBreakdown = estimateCostBreakdown({ provider, model, usage })
    this.runCost = mergeCostBreakdown(this.runCost, costBreakdown)
  }

  incrementRunCost(cost: CostBreakdown) {
    this.runCost = mergeCostBreakdown(this.runCost, cost)
  }

  protected async updateStateFromResponse({
    provider,
    model,
    response,
    messages,
    tokenUsage,
    finishReason,
  }: {
    provider: Providers
    model: string
    response: ChainStepResponse<StreamType>
    messages: Message[]
    tokenUsage: LanguageModelUsage
    finishReason?: FinishReason
  }) {
    this.messages.push(...messages)
    this.response = response
    this.finishReason = finishReason
    this.incrementLogUsage(tokenUsage)
    this.incrementRunUsage(tokenUsage)
    this.incrementLogCost({ provider, model, usage: tokenUsage })
    this.incrementRunCostFromUsage({ provider, model, usage: tokenUsage })
  }

  protected setMessages(messages: Message[]) {
    this.messages = messages
  }
}
