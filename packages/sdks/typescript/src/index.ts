import {
  type ContentType,
  type Message,
  type MessageRole,
  type ToolCall,
} from '@latitude-data/compiler'
import {
  AGENT_RETURN_TOOL_NAME,
  Providers,
  PublicManualEvaluationResultV2,
  type ChainEventDto,
  type DocumentLog,
  type ToolCallResponse,
} from '@latitude-data/constants'

import env from '$sdk/env'
import { GatewayApiConfig, RouteResolver } from '$sdk/utils'
import {
  ApiErrorCodes,
  ApiErrorJsonResponse,
  LatitudeApiError,
} from '$sdk/utils/errors'
import { makeRequest } from '$sdk/utils/request'
import { streamChat } from '$sdk/utils/streamChat'
import { streamRun } from '$sdk/utils/streamRun'
import { syncChat } from '$sdk/utils/syncChat'
import { syncRun } from '$sdk/utils/syncRun'
import {
  ChatOptions,
  GetOrCreatePromptOptions,
  GetPromptOptions,
  HandlerType,
  LogSources,
  Prompt,
  RenderChainOptions,
  RenderPromptOptions,
  RenderToolCallDetails,
  RenderToolCalledFn,
  RunPromptOptions,
  SDKOptions,
  StreamChainResponse,
  ToolCallDetails,
  ToolHandler,
  ToolInstrumentation,
  ToolSpec,
  TraceInstrumentation,
} from '$sdk/utils/types'
import {
  AdapterMessageType,
  Chain,
  Config,
  ContentType as PromptlContentType,
  MessageRole as PromptlMessageRole,
  ProviderAdapter,
  render,
  type Message as PromptlMessage,
  type ToolCallContent,
} from 'promptl-ai'

import { adaptPromptConfigToProvider } from './utils/adapters/adaptPromptConfigToProvider'
import { getPromptlAdapterFromProvider } from './utils/adapters/getAdapterFromProvider'
import { injectAgentFinishTool } from './utils/agents'

const WAIT_IN_MS_BEFORE_RETRY = 1000
const DEFAULT_GATEWAY = {
  host: env.GATEWAY_HOSTNAME,
  port: env.GATEWAY_PORT,
  ssl: env.GATEWAY_SSL,
}
const DEFAULT_INTERNAL = {
  source: LogSources.API,
  retryMs: WAIT_IN_MS_BEFORE_RETRY,
}

type Options = {
  versionUuid?: string
  projectId?: number
  __internal?: {
    gateway?: GatewayApiConfig
    source?: LogSources
    retryMs?: number
  }
}

class Latitude {
  protected options: SDKOptions
  protected static instrumentation?: Instrumentation

  public evaluations: {
    annotate: (
      uuid: string,
      score: number,
      evaluationUuid: string,
      opts?: {
        reason?: string
        versionUuid?: string
      },
    ) => Promise<PublicManualEvaluationResultV2>
  }

  public logs: {
    create: (
      path: string,
      messages: Message[],
      options?: {
        projectId?: number
        versionUuid?: string
        response?: string
      },
    ) => Promise<DocumentLog>
  }

  public prompts: {
    get: (path: string, args?: GetPromptOptions) => Promise<Prompt>
    getAll: (args?: GetPromptOptions) => Promise<Prompt[]>
    getOrCreate: (
      path: string,
      args?: GetOrCreatePromptOptions,
    ) => Promise<Prompt>
    run: <Tools extends ToolSpec = {}>(
      path: string,
      args: RunPromptOptions<Tools>,
    ) => Promise<(StreamChainResponse & { uuid: string }) | undefined>
    chat: <Tools extends ToolSpec = {}>(
      uuid: string,
      messages: Message[],
      args?: Omit<ChatOptions<Tools>, 'messages'>,
    ) => Promise<StreamChainResponse | undefined>
    render: <M extends AdapterMessageType = PromptlMessage>(
      args: RenderPromptOptions<M>,
    ) => Promise<{ config: Config; messages: M[] }>
    renderChain: <M extends AdapterMessageType = PromptlMessage>(
      args: RenderChainOptions<M>,
    ) => Promise<{ config: Config; messages: M[] }>
    renderAgent: <M extends AdapterMessageType = PromptlMessage>(
      args: RenderChainOptions<M>,
    ) => Promise<{ config: Config; messages: M[]; result: unknown }>
  }

  constructor(
    apiKey: string,
    {
      projectId,
      versionUuid,
      __internal = {
        gateway: DEFAULT_GATEWAY,
      },
    }: Options = {
      __internal: {
        gateway: DEFAULT_GATEWAY,
      },
    },
  ) {
    const { source, retryMs } = { ...DEFAULT_INTERNAL, ...__internal }
    const { gateway = DEFAULT_GATEWAY } = __internal

    this.options = {
      apiKey,
      retryMs,
      source,
      versionUuid,
      projectId,
      routeResolver: new RouteResolver({
        gateway,
        apiVersion: 'v3',
      }),
    }

    // Wrap methods for instrumentation
    this.wrapMethods()

    // Initialize evaluations namespace
    this.evaluations = {
      annotate: this.annotate.bind(this),
    }

    // Initialize logs namespace
    this.logs = {
      create: this.createLog.bind(this),
    }

    // Initialize prompts namespace
    this.prompts = {
      get: this.getPrompt.bind(this),
      getAll: this.getAllPrompts.bind(this),
      getOrCreate: this.getOrCreatePrompt.bind(this),
      run: this.runPrompt.bind(this),
      chat: this.chat.bind(this),
      render: this.renderPrompt.bind(this),
      renderChain: this.renderChain.bind(this),
      renderAgent: this.renderAgent.bind(this),
    }
  }

  static instrument(instrumentation: Instrumentation) {
    Latitude.instrumentation = instrumentation
  }

  static uninstrument() {
    Latitude.instrumentation = undefined
  }

  private wrapMethods() {
    const _renderChain = this.renderChain.bind(this)
    this.renderChain = ((...args: Parameters<typeof _renderChain>) => {
      if (!Latitude.instrumentation) return _renderChain(...args)
      return Latitude.instrumentation.wrapRenderChain(_renderChain, ...args)
    }) as typeof _renderChain

    const _renderAgent = this.renderAgent.bind(this)
    this.renderAgent = ((...args: Parameters<typeof _renderAgent>) => {
      if (!Latitude.instrumentation) return _renderAgent(...args)
      return Latitude.instrumentation.wrapRenderAgent(_renderAgent, ...args)
    }) as typeof _renderAgent

    const _renderStep = this.renderStep.bind(this)
    this.renderStep = ((...args: Parameters<typeof _renderStep>) => {
      if (!Latitude.instrumentation) return _renderStep(...args)
      return Latitude.instrumentation.wrapRenderStep(_renderStep, ...args)
    }) as typeof _renderStep

    const _renderCompletion = this.renderCompletion.bind(this)
    this.renderCompletion = ((
      ...args: Parameters<typeof _renderCompletion>
    ) => {
      if (!Latitude.instrumentation) return _renderCompletion(...args)
      return Latitude.instrumentation.wrapRenderCompletion(
        _renderCompletion,
        ...args,
      )
    }) as typeof _renderCompletion

    const _renderTool = this.renderTool.bind(this)
    this.renderTool = ((...args: Parameters<typeof _renderTool>) => {
      if (!Latitude.instrumentation) return _renderTool(...args)
      return Latitude.instrumentation.wrapRenderTool(_renderTool, ...args)
    }) as typeof _renderTool
  }

  private async getPrompt(
    path: string,
    { projectId, versionUuid }: GetPromptOptions = {},
  ) {
    projectId = projectId ?? this.options.projectId
    if (!projectId) throw new Error('Project ID is required')

    versionUuid = versionUuid ?? this.options.versionUuid

    const response = await makeRequest({
      method: 'GET',
      handler: HandlerType.GetDocument,
      params: { projectId, versionUuid, path },
      options: this.options,
    })

    if (!response.ok) {
      const error = (await response.json()) as ApiErrorJsonResponse

      throw new LatitudeApiError({
        status: response.status,
        serverResponse: JSON.stringify(error),
        message: error.message,
        errorCode: error.errorCode,
        dbErrorRef: error.dbErrorRef,
      })
    }

    return (await response.json()) as Prompt
  }

  private async getAllPrompts({
    projectId,
    versionUuid,
  }: GetPromptOptions = {}) {
    projectId = projectId ?? this.options.projectId
    if (!projectId) throw new Error('Project ID is required')

    versionUuid = versionUuid ?? this.options.versionUuid

    const response = await makeRequest({
      method: 'GET',
      handler: HandlerType.GetAllDocuments,
      params: { projectId, versionUuid },
      options: this.options,
    })

    if (!response.ok) {
      const error = (await response.json()) as ApiErrorJsonResponse

      throw new LatitudeApiError({
        status: response.status,
        serverResponse: JSON.stringify(error),
        message: error.message,
        errorCode: error.errorCode,
        dbErrorRef: error.dbErrorRef,
      })
    }

    return (await response.json()) as Prompt[]
  }

  private async getOrCreatePrompt(
    path: string,
    { projectId, versionUuid, prompt }: GetOrCreatePromptOptions = {},
  ) {
    projectId = projectId ?? this.options.projectId
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    versionUuid = versionUuid ?? this.options.versionUuid

    const response = await makeRequest({
      method: 'POST',
      handler: HandlerType.GetOrCreateDocument,
      params: { projectId, versionUuid },
      options: this.options,
      body: { path, prompt },
    })

    if (!response.ok) {
      const error = (await response.json()) as ApiErrorJsonResponse
      throw new LatitudeApiError({
        status: response.status,
        serverResponse: JSON.stringify(error),
        message: error.message,
        errorCode: error.errorCode,
        dbErrorRef: error.dbErrorRef,
      })
    }

    return (await response.json()) as Prompt
  }

  private async runPrompt<Tools extends ToolSpec>(
    path: string,
    args: RunPromptOptions<Tools>,
  ) {
    const options = {
      ...args,
      options: {
        ...this.options,
        signal: args.signal,
      },
      instrumentation: Latitude.instrumentation,
    }

    if (args.stream) return streamRun(path, options)
    return syncRun(path, options)
  }

  private async createLog(
    path: string,
    messages: Message[],
    {
      response,
      projectId,
      versionUuid,
    }: {
      projectId?: number
      versionUuid?: string
      response?: string
    } = {},
  ) {
    projectId = projectId ?? this.options.projectId
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    versionUuid = versionUuid ?? this.options.versionUuid

    const httpResponse = await makeRequest({
      method: 'POST',
      handler: HandlerType.Log,
      params: { projectId, versionUuid },
      body: { path, messages, response },
      options: this.options,
    })

    if (!httpResponse.ok) {
      throw new LatitudeApiError({
        status: httpResponse.status,
        message: httpResponse.statusText,
        serverResponse: await httpResponse.text(),
        errorCode: ApiErrorCodes.HTTPException,
      })
    }

    return (await httpResponse.json()) as DocumentLog
  }

  private async chat<Tools extends ToolSpec>(
    uuid: string,
    messages: Message[],
    args?: Omit<ChatOptions<Tools>, 'messages'>,
  ) {
    // Note: Args is optional and messages is omitted to maintain backwards compatibility
    const options = {
      ...(args || {}),
      messages,
      options: {
        ...this.options,
        signal: args?.signal,
      },
      instrumentation: Latitude.instrumentation,
    }

    if (args?.stream) return streamChat(uuid, options)
    return syncChat(uuid, options)
  }

  private async renderPrompt<M extends AdapterMessageType = PromptlMessage>({
    prompt,
    parameters,
    adapter: _adapter,
  }: RenderPromptOptions<M>) {
    const adapter = _adapter ?? getPromptlAdapterFromProvider(Providers.OpenAI)
    const { config, messages } = await render({
      prompt: prompt.content,
      parameters,
      adapter,
    })

    return {
      config: adaptPromptConfigToProvider(config, adapter),
      messages,
    }
  }

  protected async renderCompletion<
    M extends AdapterMessageType = PromptlMessage,
  >({
    messages,
    config,
    onStep,
    adapter,
  }: {
    provider: string
    config: Config
    prompt?: string
    parameters?: Record<string, unknown>
    messages: M[]
    adapter: ProviderAdapter<M>
  } & Pick<RenderChainOptions<M>, 'onStep'>) {
    const response = await onStep({ messages, config })
    const message: M =
      typeof response === 'string'
        ? adapter.fromPromptl({
            config: {},
            messages: [
              {
                role: PromptlMessageRole.assistant,
                content: [
                  {
                    type: PromptlContentType.text,
                    text: response,
                  },
                ],
              },
            ],
          }).messages[0]!
        : ({
            ...response,
            role: PromptlMessageRole.assistant,
          } as M)

    const promptlMessage = adapter.toPromptl({
      messages: [message],
      config: {},
    }).messages[0]!

    const toolRequests = promptlMessage.content.filter(
      (c) => c.type === PromptlContentType.toolCall,
    )

    return {
      messages: [message],
      toolRequests,
    }
  }

  protected async renderStep<M extends AdapterMessageType = PromptlMessage>({
    provider,
    messages,
    config,
    prompt,
    parameters,
    onStep,
    tools,
    adapter,
  }: {
    step: number
    provider: string
    config: Config
    prompt?: string
    parameters?: Record<string, unknown>
    messages: M[]
    adapter: ProviderAdapter<M>
  } & Pick<RenderChainOptions<M>, 'onStep' | 'tools'>) {
    const completion = await this.renderCompletion({
      provider,
      config,
      prompt,
      parameters,
      messages,
      adapter,
      onStep,
    })

    if (!completion.toolRequests.length) {
      return {
        messages: completion.messages,
      }
    }

    const requests = await this.handleToolRequests({
      messages,
      toolRequests: completion.toolRequests,
      tools,
      adapter,
    })

    return {
      messages: [...completion.messages, ...requests.messages],
    }
  }

  protected async renderChain<M extends AdapterMessageType = PromptlMessage>({
    prompt,
    parameters,
    adapter: _adapter,
    onStep,
    logResponses,
    tools,
  }: RenderChainOptions<M>) {
    const adapter = _adapter ?? getPromptlAdapterFromProvider(prompt.provider)
    const chain = new Chain({
      prompt: prompt.content,
      parameters,
      adapter,
    })

    let lastResponse: M[]
    let step = await chain.step(undefined)
    let index = 1

    while (!step.completed) {
      const config = adaptPromptConfigToProvider(step.config, adapter)

      const result = await this.renderStep({
        step: index,
        provider:
          (step.config.provider as string) || prompt.provider || 'unknown',
        config,
        ...(index === 1 && {
          prompt: prompt.content,
          parameters,
        }),
        messages: step.messages,
        onStep,
        tools,
        adapter,
      })
      lastResponse = result.messages

      step = await chain.step(lastResponse)
      index++
    }

    if (logResponses) {
      await this.logs.create(
        prompt.path,
        // Inexistent types incompatibilities between legacy messages and promptl messages
        step.messages as unknown as Message[],
      )
    }

    return {
      config: adaptPromptConfigToProvider(step.config, adapter),
      messages: step.messages,
    }
  }

  protected async renderAgent<M extends AdapterMessageType = PromptlMessage>({
    prompt,
    parameters,
    adapter: _adapter,
    onStep,
    logResponses,
    tools,
  }: RenderChainOptions<M>) {
    const adapter = _adapter ?? getPromptlAdapterFromProvider(prompt.provider)
    const chain = new Chain({
      prompt: prompt.content,
      parameters,
      adapter,
    })

    let lastResponse: M[]
    let step = await chain.step(undefined)
    let index = 1

    let agentResponse = undefined

    while (!step.completed) {
      const config = adaptPromptConfigToProvider(step.config, adapter)

      const result = await this.renderStep({
        step: index,
        provider:
          (step.config.provider as string) || prompt.provider || 'unknown',
        config,
        ...(index === 1 && {
          prompt: prompt.content,
          parameters,
        }),
        messages: step.messages,
        onStep,
        tools,
        adapter,
      })

      lastResponse = result.messages
      step = await chain.step(lastResponse)
      index++
    }

    const messages = step.messages
    const config = adaptPromptConfigToProvider(
      injectAgentFinishTool(step.config),
      adapter,
    )

    tools = {
      ...(tools ?? {}),
      [AGENT_RETURN_TOOL_NAME]: async (toolArguments) => {
        agentResponse = toolArguments
        return {}
      },
    }

    while (agentResponse === undefined) {
      const result = await this.renderStep({
        step: index,
        provider:
          (step.config.provider as string) || prompt.provider || 'unknown',
        config,
        ...(index === 1 && {
          prompt: prompt.content,
          parameters,
        }),
        messages,
        onStep,
        tools,
        adapter,
      })
      lastResponse = result.messages

      messages.push(...lastResponse)
      index++
    }

    if (logResponses) {
      await this.logs.create(
        prompt.path,
        // Inexistent types incompatibilities between legacy messages and promptl messages
        messages as unknown as Message[],
      )
    }

    return {
      config: adaptPromptConfigToProvider(step.config, adapter),
      messages,
      result: agentResponse,
    }
  }

  protected async renderTool<M extends AdapterMessageType = PromptlMessage>({
    tool,
    toolRequest,
    toolRequests,
    messages,
  }: {
    tool: RenderToolCalledFn<ToolSpec>[string]
    toolRequest: ToolCallContent
    toolRequests: ToolCallContent[]
    messages: M[]
  }) {
    return await tool(toolRequest.toolArguments, {
      toolId: toolRequest.toolCallId,
      toolName: toolRequest.toolName,
      requestedToolCalls: toolRequests as unknown as ToolCall[],
      messages: messages as unknown as Message[],
    })
  }

  private async handleToolRequests<
    M extends AdapterMessageType = PromptlMessage,
  >({
    messages,
    toolRequests,
    tools,
    adapter,
  }: {
    messages: M[]
    toolRequests: ToolCallContent[]
    tools?: RenderToolCalledFn<ToolSpec>
    adapter: ProviderAdapter<M>
  }) {
    const toolResponseMessages = await Promise.all(
      toolRequests.map(async (toolRequest) => {
        const tool = tools?.[toolRequest.toolName]

        if (!tool) {
          throw new Error(
            `Handler for tool '${toolRequest.toolName}' not found`,
          )
        }

        const toolResult = await this.renderTool({
          tool,
          toolRequest,
          toolRequests,
          messages,
        })

        return adapter.fromPromptl({
          messages: [
            {
              role: PromptlMessageRole.tool,
              content: [
                {
                  type: PromptlContentType.text,
                  text: JSON.stringify(toolResult),
                },
              ],
              toolId: toolRequest.toolCallId,
              toolName: toolRequest.toolName,
            },
          ],
          config: {},
        }).messages[0]!
      }),
    )

    return {
      messages: toolResponseMessages,
    }
  }

  private async annotate(
    uuid: string,
    score: number,
    evaluationUuid: string,
    opts: {
      reason?: string
      versionUuid?: string
    } = {},
  ) {
    const { reason, versionUuid } = opts
    const response = await makeRequest({
      method: 'POST',
      handler: HandlerType.Annotate,
      params: {
        conversationUuid: uuid,
        evaluationUuid,
      },
      body: {
        score,
        metadata: reason ? { reason } : undefined,
        versionUuid: versionUuid ?? this.options.versionUuid,
      },
      options: this.options,
    })

    if (!response.ok) {
      const json = (await response.json()) as ApiErrorJsonResponse
      throw new LatitudeApiError({
        status: response.status,
        serverResponse: JSON.stringify(json),
        message: json.message,
        errorCode: json.errorCode,
        dbErrorRef: json.dbErrorRef,
      })
    }

    return (await response.json()) as PublicManualEvaluationResultV2
  }
}

export { Latitude, LatitudeApiError, LogSources }

export { Adapters } from 'promptl-ai'

export type {
  ChainEventDto,
  ContentType,
  Message,
  MessageRole,
  Options,
  Prompt,
  RenderToolCallDetails,
  StreamChainResponse,
  ToolCallDetails,
  ToolCallResponse,
  ToolHandler,
  ToolSpec,
}

export interface Instrumentation
  extends TraceInstrumentation,
    ToolInstrumentation {
  wrapRenderChain<F extends Latitude['renderChain']>(
    fn: F,
    ...args: Parameters<F>
  ): Promise<Awaited<ReturnType<F>>>
  wrapRenderAgent<F extends Latitude['renderAgent']>(
    fn: F,
    ...args: Parameters<F>
  ): Promise<Awaited<ReturnType<F>>>
  wrapRenderStep<F extends Latitude['renderStep']>(
    fn: F,
    ...args: Parameters<F>
  ): Promise<Awaited<ReturnType<F>>>
  wrapRenderCompletion<F extends Latitude['renderCompletion']>(
    fn: F,
    ...args: Parameters<F>
  ): Promise<Awaited<ReturnType<F>>>
  wrapRenderTool<F extends Latitude['renderTool']>(
    fn: F,
    ...args: Parameters<F>
  ): Promise<Awaited<ReturnType<F>>>
}
