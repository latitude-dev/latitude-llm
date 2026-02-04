import { generateText, streamText, type ModelMessage } from 'ai'
import { Adapters, render } from 'promptl-ai'

import {
  ABSOLUTE_MAX_STEPS,
  DEFAULT_MAX_STEPS,
  MAX_STEPS_CONFIG_NAME,
} from '@latitude-data/constants'

import { buildAgentTools } from '../agents/buildAgentTools'
import {
  AgentSdkError,
  MissingModelError,
  PromptNotFoundError,
  ProviderAuthError,
} from '../errors'
import { assertNoSteps } from '../prompt/assertNoSteps'
import { createLanguageModel } from '../providers/createProvider'
import { resolveModel } from '../models/resolveModel'
import { buildToolSet } from '../tools/buildToolSet'
import type {
  AgentRuntime,
  CreateAgentRuntimeOptions,
  RunAgentOptions,
  ToolHandlers,
} from '../types'
import { resolvePromptPath } from '../utils/paths'

type PromptConfig = {
  provider?: string
  model?: string
  temperature?: number
  top_p?: number
  max_tokens?: number
  presence_penalty?: number
  frequency_penalty?: number
  top_k?: number
  stop?: string[]
  tools?: unknown
  agents?: string[]
  schema?: Record<string, unknown>
  [MAX_STEPS_CONFIG_NAME]?: number
}

function resolveCallSettings(config: PromptConfig) {
  return {
    temperature: config.temperature,
    topP: config.top_p,
    maxOutputTokens: config.max_tokens,
    presencePenalty: config.presence_penalty,
    frequencyPenalty: config.frequency_penalty,
    topK: config.top_k,
    stopSequences: config.stop,
  }
}

async function resolveApiKey(
  config: {
    providerId: string
    modelName: string
    modelId: string
    providerEnv?: string[]
  },
  secrets?: CreateAgentRuntimeOptions['secrets'],
) {
  const secret = await secrets?.({
    provider: config.providerId,
    model: config.modelName,
    modelId: config.modelId,
  })

  if (secret) return secret

  const envKeys = config.providerEnv ?? []
  for (const envKey of envKeys) {
    const value = process.env[envKey]
    if (value) return value
  }

  if (envKeys.length) {
    throw new ProviderAuthError(
      `Missing API key for provider '${config.providerId}'`,
    )
  }

  return undefined
}

function resolveModelId(
  options: RunAgentOptions | undefined,
  config: PromptConfig,
  defaults?: CreateAgentRuntimeOptions['defaults'],
): string {
  const modelId =
    options?.model ??
    (config.provider && config.model
      ? `${config.provider}/${config.model}`
      : undefined) ??
    defaults?.model

  if (!modelId) {
    throw new MissingModelError('Model is required')
  }

  return modelId
}

function resolveMaxSteps(
  options: RunAgentOptions | undefined,
  config: PromptConfig,
  defaults?: CreateAgentRuntimeOptions['defaults'],
): number {
  const configured =
    options?.maxSteps ??
    config[MAX_STEPS_CONFIG_NAME] ??
    defaults?.maxSteps ??
    DEFAULT_MAX_STEPS

  return Math.min(configured, ABSOLUTE_MAX_STEPS)
}

async function renderPrompt({
  prompt,
  parameters,
  referenceFn,
  fullPath,
}: {
  prompt: string
  parameters?: Record<string, unknown>
  referenceFn: Parameters<typeof render>[0]['referenceFn']
  fullPath: string
}) {
  return render({
    prompt,
    parameters,
    adapter: Adapters.vercel,
    referenceFn,
    fullPath,
  })
}

/** Creates a PromptL agent runtime. */
export function createAgentRuntime({
  loader,
  secrets,
  tools: runtimeTools = {},
  defaults,
}: CreateAgentRuntimeOptions): AgentRuntime {
  let registeredTools: ToolHandlers = { ...runtimeTools }
  let registeredAgents: string[] = []

  const run = async (path: string, options: RunAgentOptions = {}) => {
    const normalizedPath = resolvePromptPath(path)
    const document = await loader.load(normalizedPath)
    if (!document) {
      throw new PromptNotFoundError(`Prompt not found: ${normalizedPath}`)
    }

    assertNoSteps(document.content)

    const referenceFn: Parameters<typeof render>[0]['referenceFn'] = async (
      target,
      from,
    ) => {
      const resolved = resolvePromptPath(target, from)
      const refDoc = await loader.load(resolved)
      return refDoc ? { path: refDoc.path, content: refDoc.content } : undefined
    }

    const { config, messages } = await renderPrompt({
      prompt: document.content,
      parameters: options.parameters,
      referenceFn,
      fullPath: document.path,
    })

    const modelMessages = messages as unknown as ModelMessage[]

    const promptConfig = config as PromptConfig
    const modelId = resolveModelId(options, promptConfig, defaults)
    const resolvedModel = await resolveModel(modelId)
    const apiKey = await resolveApiKey(
      {
        providerId: resolvedModel.providerId,
        modelName: resolvedModel.modelName,
        modelId: resolvedModel.modelId,
        providerEnv: resolvedModel.provider.env,
      },
      secrets,
    )

    const model = await createLanguageModel(
      resolvedModel.provider,
      resolvedModel.modelName,
      apiKey,
    )

    const agentPaths = options.agents ?? promptConfig.agents ?? registeredAgents
    const agentTools = await buildAgentTools({
      agentPaths: agentPaths.map((agentPath) =>
        resolvePromptPath(agentPath, document.path),
      ),
      loader,
      executeAgent: async (agentPath, agentOptions) => {
        const result = await run(agentPath, {
          ...agentOptions,
          stream: false,
        })

        return result as { text: string; output?: unknown }
      },
      modelOverride: options.model,
      tools: { ...registeredTools, ...options.tools },
      signal: options.signal,
    })

    const tools = {
      ...buildToolSet(promptConfig.tools, {
        ...registeredTools,
        ...options.tools,
      }),
      ...agentTools,
    }

    const maxSteps = resolveMaxSteps(options, promptConfig, defaults)
    const settings = resolveCallSettings(promptConfig)

    if (options.stream) {
      return streamText({
        model,
        messages: modelMessages,
        tools,
        abortSignal: options.signal,
        ...settings,
      })
    }

    let currentMessages = modelMessages
    let result = await generateText({
      model,
      messages: currentMessages,
      tools,
      abortSignal: options.signal,
      ...settings,
    })

    let stepCount = 1
    while (result.toolCalls.length && stepCount < maxSteps) {
      const nextMessages = result.response.messages as unknown as ModelMessage[]
      currentMessages = currentMessages.concat(nextMessages)
      result = await generateText({
        model,
        messages: currentMessages,
        tools,
        abortSignal: options.signal,
        ...settings,
      })
      stepCount += 1
    }

    let output: unknown = undefined
    if (promptConfig.schema) {
      try {
        output = JSON.parse(result.text)
      } catch {
        throw new AgentSdkError('Failed to parse structured output')
      }
    }

    return {
      text: result.text,
      output,
    }
  }

  return {
    run,
    agent: (path: string) => ({
      run: (options?: RunAgentOptions) => run(path, options),
      stream: (options?: RunAgentOptions) =>
        run(path, { ...options, stream: true }),
    }),
    registerTools: (handlers: ToolHandlers) => {
      registeredTools = { ...registeredTools, ...handlers }
    },
    registerAgents: (paths: string[]) => {
      registeredAgents = [...registeredAgents, ...paths]
    },
  }
}
