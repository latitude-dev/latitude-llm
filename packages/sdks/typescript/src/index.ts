import {
  type ToolCall,
  type ContentType,
  type Message,
  type MessageRole,
} from '@latitude-data/compiler'
import {
  AGENT_RETURN_TOOL_NAME,
  Providers,
  PublicManualEvaluationResultV2,
  type ChainEventDto,
  type DocumentLog,
  type ToolCallResponse,
} from '@latitude-data/constants'

import {
  AdapterMessageType,
  Chain,
  Config,
  ProviderAdapter,
  render,
  type Message as PromptlMessage,
  MessageRole as PromptlMessageRole,
  ContentType as PromptlContentType,
} from 'promptl-ai'
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
  RenderToolCalledFn,
  RunPromptOptions,
  SDKOptions,
  StreamChainResponse,
  ToolSpec,
} from '$sdk/utils/types'

import { adaptPromptConfigToProvider } from './utils/adapters/adaptPromptConfigToProvider'
import { getPromptlAdapterFromProvider } from './utils/adapters/getAdapterFromProvider'
import { injectAgentFinishTool } from './utils/agents'

const WAIT_IN_MS_BEFORE_RETRY = 1000
const DEFAULT_GAWATE_WAY = {
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
        gateway: DEFAULT_GAWATE_WAY,
      },
    }: Options = {
      __internal: {
        gateway: DEFAULT_GAWATE_WAY,
      },
    },
  ) {
    const { source, retryMs } = { ...DEFAULT_INTERNAL, ...__internal }
    const { gateway = DEFAULT_GAWATE_WAY } = __internal

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

  async getPrompt(
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

  async getAllPrompts({ projectId, versionUuid }: GetPromptOptions = {}) {
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

  async getOrCreatePrompt(
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

  private async renderChain<M extends AdapterMessageType = PromptlMessage>({
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

    while (!step.completed) {
      const response = await onStep({
        messages: step.messages,
        config: adaptPromptConfigToProvider(step.config, adapter),
      })

      lastResponse = await this.handleRenderResponse({
        messages: step.messages,
        response,
        tools,
        adapter,
      })

      step = await chain.step(lastResponse)
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

  private async renderAgent<M extends AdapterMessageType = PromptlMessage>({
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

    let agentResponse = undefined

    while (!step.completed) {
      const response = await onStep({
        messages: step.messages,
        config: adaptPromptConfigToProvider(step.config, adapter),
      })

      lastResponse = await this.handleRenderResponse({
        messages: step.messages,
        response,
        tools,
        adapter,
      })

      step = await chain.step(lastResponse)
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
      const response = await onStep({
        messages,
        config,
      })

      lastResponse = await this.handleRenderResponse({
        messages: step.messages,
        response,
        tools,
        adapter,
      })

      messages.push(...lastResponse)
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

  private async handleRenderResponse<
    M extends AdapterMessageType = PromptlMessage,
  >({
    messages,
    response,
    tools,
    adapter,
  }: {
    messages: M[]
    response: string | Omit<M, 'role'>
    tools?: RenderToolCalledFn<ToolSpec>
    adapter: ProviderAdapter<M>
  }): Promise<M[]> {
    const responseMessage: M =
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
      messages: [responseMessage],
      config: {},
    }).messages[0]!
    const toolRequests = promptlMessage.content.filter(
      (c) => c.type === PromptlContentType.toolCall,
    )

    const toolResponseMessages = await Promise.all(
      toolRequests.map(async (toolRequest) => {
        const tool = tools?.[toolRequest.toolName]

        if (!tool) {
          throw new Error(
            `Handler for tool '${toolRequest.toolName}' not found`,
          )
        }

        const toolResult = await tool(toolRequest.toolArguments, {
          toolId: toolRequest.toolCallId,
          toolName: toolRequest.toolName,
          requestedToolCalls: toolRequests as unknown as ToolCall[],
          messages: messages as unknown as Message[],
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

    return [responseMessage, ...toolResponseMessages]
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
  StreamChainResponse,
  ToolCallResponse,
}
