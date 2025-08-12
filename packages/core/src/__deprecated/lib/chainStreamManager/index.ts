import { FinishReason } from 'ai'
import {
  AssistantMessage,
  Conversation,
  Message,
  ToolCall,
  ToolMessage,
} from '@latitude-data/compiler'
import {
  ChainEvent,
  ChainEventTypes,
  ChainStepResponse,
  EMPTY_USAGE,
  LegacyVercelSDKVersion4Usage as LanguageModelUsage,
  LogSources,
  OmittedLatitudeEventData,
  StreamEventTypes,
  StreamType,
} from '@latitude-data/constants'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { JSONSchema7 } from 'json-schema'
import { omit } from 'lodash-es'
import { IntegrationDto, ProviderApiKey, Workspace } from '../../../browser'
import type { PromptSource } from '../../../constants'
import { buildMessagesFromResponse } from '../../../helpers'
import { createMcpClientManager } from '../../../services/integrations/McpClient/McpClientManager'
import { resolveToolsFromConfig } from './resolveTools'
import { ToolSource } from './resolveTools/types'
import { streamAIResponse } from './step/streamAIResponse'
import { getBuiltInToolCallResponses } from './step/toolExecution'
import { incrementTokens } from '../../../lib/streamManager'

const createPromiseWithResolver = <T>(): readonly [
  Promise<T>,
  (value: T) => void,
] => {
  let resolveValue: (value: T) => void

  const promisedValue = new Promise<T>((res) => {
    let isResolved = false
    resolveValue = (value) => {
      if (isResolved) return
      isResolved = true
      res(value)
    }
  })

  return [promisedValue, resolveValue!] as const
}

export class ChainStreamManager {
  private finished = false
  private inStep = false

  private tokenUsage: LanguageModelUsage
  private messages: Message[]
  private lastResponse?: ChainStepResponse<StreamType>
  private errorableUuid: string
  private promptSource: PromptSource
  private workspace: Workspace

  private resolveMessages?: (messages: Message[]) => void
  private resolveToolCalls?: (toolCalls: ToolCall[]) => void
  private resolveError?: (error: ChainError<RunErrorCodes> | undefined) => void
  private resolveLastResponse?: (
    response: ChainStepResponse<StreamType> | undefined,
  ) => void
  private controller?: ReadableStreamDefaultController<ChainEvent>
  private finishReason?: FinishReason
  private mcpClientManager: ReturnType<typeof createMcpClientManager>

  constructor({
    workspace,
    errorableUuid,
    messages = [],
    tokenUsage = EMPTY_USAGE(),
    promptSource,
  }: {
    workspace: Workspace
    errorableUuid: string
    messages?: Message[]
    tokenUsage?: LanguageModelUsage
    promptSource: PromptSource
  }) {
    this.workspace = workspace
    this.messages = messages
    this.tokenUsage = tokenUsage
    this.errorableUuid = errorableUuid
    this.promptSource = promptSource
    this.mcpClientManager = createMcpClientManager()
  }

  /**
   * Starts the chain stream
   * @returns The stream, and a promise that resolves to the messages when the chain is done
   */
  start(
    cb?: () => Promise<{
      conversation: Conversation
    }>,
    abortSignal?: AbortSignal,
  ): {
    stream: ReadableStream<ChainEvent>
    messages: Promise<Message[]>
    toolCalls: Promise<ToolCall[]>
    error: Promise<ChainError<RunErrorCodes> | undefined>
    lastResponse: Promise<ChainStepResponse<StreamType> | undefined>
  } {
    if (this.controller) throw new Error('Chain already started')
    if (this.finished) throw new Error('Chain already finished')

    const [messages, resolveMessages] = createPromiseWithResolver<Message[]>()
    const [error, resolveError] = createPromiseWithResolver<
      ChainError<RunErrorCodes> | undefined
    >()
    const [toolCalls, resolveToolCalls] =
      createPromiseWithResolver<ToolCall[]>()
    const [lastResponse, resolveLastResponse] = createPromiseWithResolver<
      ChainStepResponse<StreamType> | undefined
    >()
    this.resolveMessages = resolveMessages
    this.resolveError = resolveError
    this.resolveToolCalls = resolveToolCalls
    this.resolveLastResponse = resolveLastResponse

    const stream = new ReadableStream<ChainEvent>({
      start: (controller) => {
        this.controller = controller
        this.sendEvent({ type: ChainEventTypes.ChainStarted })

        if (abortSignal) {
          if (abortSignal.aborted) {
            return this.error(
              new ChainError({
                message: 'Stream aborted by user',
                code: RunErrorCodes.AbortError,
              }),
            )
          }

          abortSignal.addEventListener(
            'abort',
            () => {
              this.error(
                new ChainError({
                  message: 'Stream aborted by user',
                  code: RunErrorCodes.AbortError,
                }),
              )
            },
            { once: true },
          )
        }

        cb?.()
          .then(() => !this.finished && this.done())
          .catch((error) => this.error(error))
      },
    })

    return {
      stream,
      messages,
      toolCalls,
      error,
      lastResponse,
    }
  }

  /**
   * Generates the provider response, or fetches it from cache.
   *
   * Sends both StepStarted and StepCompleted events.
   */
  async getProviderResponse({
    provider,
    conversation,
    source,
    schema,
    output,
    injectFakeAgentStartTool,
    injectAgentFinishTool,
    abortSignal,
  }: {
    provider: ProviderApiKey
    conversation: Conversation
    source: LogSources
    schema?: JSONSchema7
    output?: 'object' | 'array' | 'no-schema'
    injectFakeAgentStartTool?: boolean
    injectAgentFinishTool?: boolean
    abortSignal?: AbortSignal
  }) {
    if (!this.controller) throw new Error('Stream not started')

    // TODO: This may conflict with isolated steps
    this.messages = [...conversation.messages]

    if (this.inStep) this.completeStep()
    this.startStep()

    const resolvedTools = await resolveToolsFromConfig({
      workspace: this.workspace,
      promptSource: this.promptSource,
      config: conversation.config as LatitudePromptConfig,
      injectAgentFinishTool,
      chainStreamManager: this,
    }).then((r) => r.unwrap())

    const tools = Object.fromEntries(
      Object.entries(resolvedTools).map(([name, { definition }]) => [
        name,
        definition,
      ]),
    )

    const resolvedConfig = {
      ...omit(conversation.config, 'tools', 'latitudeTools', 'agents'),
      ...(Object.keys(tools).length ? { tools } : {}),
    }

    this.sendEvent({
      type: ChainEventTypes.ProviderStarted,
      config: resolvedConfig,
    })

    const { response, tokenUsage } = await streamAIResponse({
      controller: this.controller,
      workspace: this.workspace,
      provider,
      source,
      documentLogUuid: this.errorableUuid,
      conversation: {
        ...conversation,
        config: resolvedConfig,
      },
      schema,
      output,
      injectFakeAgentStartTool,
      abortSignal,
    })
    this.addMessageFromResponse(response)

    this.finishReason = response.finishReason
    this.tokenUsage = incrementTokens({
      prev: this.tokenUsage,
      next: tokenUsage,
    })
    this.setLastResponse(response)

    this.sendEvent({
      type: ChainEventTypes.ProviderCompleted,
      providerLogUuid: response.providerLog!.uuid,
      tokenUsage,
      finishReason: response.finishReason ?? 'stop',
      response,
    })

    const toolCalls = (response as ChainStepResponse<'text'>).toolCalls ?? []
    const clientToolCalls = toolCalls.filter((toolCall) => {
      const toolSource = resolvedTools[toolCall.name]?.sourceData
      return (
        toolSource === undefined || // send unknown tools
        toolSource.source === ToolSource.Client || // send known client tools
        toolSource.source === ToolSource.AgentReturn // client must manage the agent return tool too
      )
    })

    return {
      response,
      clientToolCalls,
    }
  }

  /**
   * Executes any built-in tool calls and agent-as-tool calls in a message
   * Generates the tool responses.
   *
   * Sends both ToolsStarted and ToolCompleted events.
   */
  async handleBuiltInToolCalls({
    config,
    message,
  }: {
    config: LatitudePromptConfig
    message: AssistantMessage
  }): Promise<ToolMessage[]> {
    const resolvedTools = await resolveToolsFromConfig({
      workspace: this.workspace,
      promptSource: this.promptSource,
      config,
      injectAgentFinishTool: true, // Always added here, just to manage them when needed
    }).then((r) => r.unwrap())

    const toolCalls = message.toolCalls ?? []
    const nonClientToolCalls = toolCalls.filter(
      (tc) => resolvedTools[tc.name]?.sourceData.source !== ToolSource.Client,
    )

    if (!nonClientToolCalls.length) return []
    if (!this.inStep) this.startStep()

    this.sendEvent({
      type: ChainEventTypes.ToolsStarted,
      tools: nonClientToolCalls,
    })

    const toolResponses = getBuiltInToolCallResponses({
      workspace: this.workspace,
      promptSource: this.promptSource,
      resolvedTools,
      toolCalls: nonClientToolCalls,
      chainStreamManager: this,
      mcpClientManager: this.mcpClientManager,
      onFinish: (toolMessage: ToolMessage) => {
        this.messages.push(toolMessage)
        this.sendEvent({ type: ChainEventTypes.ToolCompleted })
      },
    })

    return await Promise.all(toolResponses)
  }

  startStep() {
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

  completeStep() {
    if (!this.controller) throw new Error('Stream not started')
    if (!this.inStep)
      throw new Error('Tried to complete step without starting it')

    this.inStep = false
    this.sendEvent({
      type: ChainEventTypes.StepCompleted,
    })
  }

  /**
   * Ends the chain stream successfully
   */
  done() {
    if (this.finished) throw new Error('Chain already finished')
    if (this.inStep) this.completeStep()
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
    if (this.finished) throw new Error('Chain already finished')
    this.sendEvent({
      type: ChainEventTypes.ToolsRequested,
      tools,
    })
    this.resolveToolCalls?.(tools)
    this.endStream()
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
   * Ends the chain stream with an error
   */
  error(error: ChainError<RunErrorCodes>) {
    if (this.finished) throw new Error('Chain already finished')

    this.sendEvent({
      type: ChainEventTypes.ChainError,
      error: {
        name: error.name,
        message: error.message,
        details: error.details,
        stack: error.stack,
      },
    })

    this.resolveError?.(error)
    this.endStream()
  }

  forwardEvent(event: ChainEvent) {
    if (!this.controller) throw new Error('Stream not started')
    if (event.event === StreamEventTypes.Provider) {
      this.controller.enqueue(event)
      return
    }

    if (event.data.uuid !== this.errorableUuid) {
      throw new Error('Forwarded event has different errorableUuid')
    }

    // TODO(compiler): fix types
    // @ts-expect-error - TODO: fix types
    this.messages = event.data.messages
    this.sendEvent(event.data)
  }

  setLastResponse(response: ChainStepResponse<StreamType>) {
    this.lastResponse = response
  }

  private addMessageFromResponse(response: ChainStepResponse<StreamType>) {
    // TODO(compiler): fix types
    // @ts-expect-error - TODO: fix types
    this.messages.push(...buildMessagesFromResponse({ response }))
  }

  private sendEvent(event: OmittedLatitudeEventData) {
    if (!this.controller) throw new Error('Stream not started')

    this.controller.enqueue({
      event: StreamEventTypes.Latitude,
      // TODO(compiler): fix types
      // @ts-expect-error - TODO: fix types
      data: {
        ...event,
        messages: this.messages,
        uuid: this.errorableUuid,
      },
    })
  }

  private endStream() {
    if (!this.controller) throw new Error('Stream not started')
    if (this.finished) throw new Error('Chain already finished')
    this.finished = true

    try {
      this.controller.close()
      this.mcpClientManager.closeAllClients()
    } catch (_) {
      // do nothing, the stream is already closed
    }

    this.resolveMessages?.(this.messages)
    this.resolveLastResponse?.(this.lastResponse)
    this.resolveError?.(undefined)
    this.resolveToolCalls?.([])
  }
}

export { convertToLegacyChainStream } from './legacyStreamConverter'
