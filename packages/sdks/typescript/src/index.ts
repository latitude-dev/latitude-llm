import type { ContentType, Message, MessageRole } from '@latitude-data/compiler'
import {
  DocumentLog,
  EvaluationResultDto,
  type ChainEventDto,
} from '@latitude-data/core/browser'
import {
  AdapterMessageType,
  Chain,
  Config,
  render,
  type Message as PromptlMessage,
} from '@latitude-data/promptl'
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
  EvalOptions,
  GetOrCreatePromptOptions,
  GetPromptOptions,
  HandlerType,
  LogSources,
  Prompt,
  RenderChainOptions,
  RenderPromptOptions,
  RunPromptOptions,
  SDKOptions,
  StreamChainResponse,
} from '$sdk/utils/types'

import { adaptPromptConfigToProvider } from './utils/adapters/adaptPromptConfigToProvider'
import { getPromptlAdapterFromProvider } from './utils/adapters/getAdapterFromProvider'

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
  gateway?: GatewayApiConfig
  __internal?: { source?: LogSources; retryMs?: number }
}

class Latitude {
  protected options: SDKOptions

  public evaluations: {
    trigger: (uuid: string, options?: EvalOptions) => Promise<{ uuid: string }>
    createResult: (
      uuid: string,
      evaluationUuid: string,
      options: { result: string | boolean | number; reason: string },
    ) => Promise<{ uuid: string }>
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
    get: (path: string, args: GetPromptOptions) => Promise<Prompt>
    getOrCreate: (
      path: string,
      args: GetOrCreatePromptOptions,
    ) => Promise<Prompt>
    run: (path: string, args: RunPromptOptions) => Promise<any>
    chat: (
      uuid: string,
      messages: Message[],
      args?: Omit<ChatOptions, 'messages'>,
    ) => Promise<StreamChainResponse | undefined>
    render: <M extends AdapterMessageType = PromptlMessage>(
      args: RenderPromptOptions<M>,
    ) => Promise<{ config: Config; messages: M[] }>
    renderChain: <M extends AdapterMessageType = PromptlMessage>(
      args: RenderChainOptions<M>,
    ) => Promise<{ config: Config; messages: M[] }>
  }

  constructor(
    apiKey: string,
    {
      projectId,
      versionUuid,
      gateway = DEFAULT_GAWATE_WAY,
      __internal,
    }: Options = {
      gateway: DEFAULT_GAWATE_WAY,
    },
  ) {
    const { source, retryMs } = { ...DEFAULT_INTERNAL, ...__internal }
    this.options = {
      apiKey,
      retryMs,
      source,
      versionUuid,
      projectId,
      routeResolver: new RouteResolver({
        gateway,
        apiVersion: 'v2',
      }),
    }

    // Initialize evaluations namespace
    this.evaluations = {
      trigger: this.triggerEvaluation.bind(this),
      createResult: this.createResult.bind(this),
    }

    // Initialize logs namespace
    this.logs = {
      create: this.createLog.bind(this),
    }

    // Initialize prompts namespace
    this.prompts = {
      get: this.getPrompt.bind(this),
      getOrCreate: this.getOrCreatePrompt.bind(this),
      run: this.runPrompt.bind(this),
      chat: this.chat.bind(this),
      render: this.renderPrompt.bind(this),
      renderChain: this.renderChain.bind(this),
    }
  }

  async getPrompt(
    path: string,
    { projectId, versionUuid }: GetPromptOptions = {},
  ) {
    projectId = projectId ?? this.options.projectId
    if (!projectId) {
      throw new Error('Project ID is required')
    }
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

  private async runPrompt(path: string, args: RunPromptOptions) {
    const options = { ...args, options: this.options }

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

  private async chat(
    uuid: string,
    messages: Message[],
    args?: Omit<ChatOptions, 'messages'>,
  ) {
    // Note: Args is optional and messages is omitted to maintain backwards compatibility
    const options = { ...(args || {}), messages, options: this.options }

    if (args?.stream) return streamChat(uuid, options)
    return syncChat(uuid, options)
  }

  private async renderPrompt<M extends AdapterMessageType = PromptlMessage>({
    prompt,
    parameters,
    adapter: _adapter,
  }: RenderPromptOptions<M>) {
    if (prompt.promptlVersion !== 1) {
      throw new Error(
        'The prompt is defined with the Legacy syntax. Please update it to the new syntax. Learn more: https://docs.latitude.so/guides/prompt-manager/migrate-to-promptl',
      )
    }
    const content = prompt.resolvedContent ?? prompt.content
    const adapter = _adapter ?? getPromptlAdapterFromProvider(prompt.provider)
    const { config, messages } = await render({
      prompt: content,
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
  }: RenderChainOptions<M>) {
    if (prompt.promptlVersion !== 1) {
      throw new Error(
        'The prompt is defined with the Legacy syntax. Please update it to the new syntax. Learn more: https://docs.latitude.so/guides/prompt-manager/migrate-to-promptl',
      )
    }
    const content = prompt.resolvedContent ?? prompt.content
    const adapter = _adapter ?? getPromptlAdapterFromProvider(prompt.provider)
    const chain = new Chain({
      prompt: content,
      parameters,
      adapter,
    })

    let lastResponse: string | Omit<M, 'role'> | undefined = undefined
    let step: { completed: boolean; messages: M[]; config: Config } = {
      completed: false,
      messages: [],
      config: {},
    }

    while (true) {
      step = await chain.step(lastResponse)

      if (step.completed) {
        if (logResponses) {
          await this.logs.create(
            prompt.path,
            step.messages as unknown as Message[], // Inexistent types incompatibilities between legacy messages and promptl messages
          )
        }

        return {
          config: adaptPromptConfigToProvider(step.config, adapter),
          messages: step.messages,
        }
      }

      lastResponse = await onStep({
        messages: step.messages,
        config: adaptPromptConfigToProvider(step.config, adapter),
      })
    }
  }

  private async triggerEvaluation(uuid: string, options: EvalOptions = {}) {
    const response = await makeRequest({
      method: 'POST',
      handler: HandlerType.Evaluate,
      params: { conversationUuid: uuid },
      body: { evaluationUuids: options.evaluationUuids },
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

    return (await response.json()) as { uuid: string }
  }

  private async createResult(
    uuid: string,
    evaluationUuid: string,
    {
      result,
      reason,
    }: {
      result: string | boolean | number
      reason: string
    },
  ) {
    const response = await makeRequest({
      method: 'POST',
      handler: HandlerType.EvaluationResult,
      params: {
        conversationUuid: uuid,
        evaluationUuid,
      },
      body: {
        result,
        reason,
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

    return (await response.json()) as EvaluationResultDto
  }
}

export { Latitude, LatitudeApiError, LogSources }

export { Adapters } from '@latitude-data/promptl'

export type {
  ChainEventDto,
  ContentType,
  Message,
  MessageRole,
  Options,
  StreamChainResponse,
}
