import {
  AssistantMessage,
  ContentType,
  Conversation,
  Message,
  MessageRole,
} from '@latitude-data/compiler'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import { JSONSchema7 } from 'json-schema'
import { z } from 'zod'

import { applyProviderRules, ProviderApiKey, Workspace } from '../../../browser'
import { Result, TypedResult } from '../../../lib'
import { Config } from '../../ai'
import { azureConfig, googleConfig } from '../../ai/helpers'
import { ChainError } from '../../../lib/chainStreamManager/ChainErrors'
import { checkFreeProviderQuota } from '../../chains/checkFreeProviderQuota'
import { CachedApiKeys } from '../../chains/run'
import { injectLatitudeToolsConfig } from '../../latitudeTools'
import {
  AGENT_RETURN_TOOL_NAME,
  LATITUDE_TOOLS_CONFIG_NAME,
} from '@latitude-data/constants'

export type ValidatedAgentStep = {
  config: Config
  provider: ProviderApiKey
  conversation: Conversation
  chainCompleted: boolean
  schema?: JSONSchema7
  output?: 'object' | 'array' | 'no-schema'
}

type JSONOverride = { schema: JSONSchema7; output: 'object' | 'array' }
export type ConfigOverrides = JSONOverride | { output: 'no-schema' }

type ValidatorContext = {
  workspace: Workspace
  providersMap: CachedApiKeys
  conversation: Conversation
  newMessages: Message[] | undefined
}

const findProvider = (name: string, providersMap: CachedApiKeys) => {
  const provider = providersMap.get(name)
  if (provider) return Result.ok(provider)

  const settingUrl = 'https://app.latitude.so/settings'
  return Result.error(
    new ChainError({
      message: `Provider API Key with name ${name} not found. Go to ${settingUrl} to add a new provider if there is not one already with that name.`,
      code: RunErrorCodes.MissingProvider,
    }),
  )
}

const validateConfig = (
  config: Record<string, unknown>,
): TypedResult<Config, ChainError<RunErrorCodes.DocumentConfigError>> => {
  const doc =
    'https://docs.latitude.so/guides/getting-started/providers#using-providers-in-prompts'
  const schema = z
    .object({
      model: z.string({
        message: `"model" attribute is required. Read more here: ${doc}`,
      }),
      provider: z.string({
        message: `"provider" attribute is required. Read more here: ${doc}`,
      }),
      [LATITUDE_TOOLS_CONFIG_NAME]: z.array(z.string()).optional(),
      google: googleConfig.optional(),
      azure: azureConfig.optional(),
    })
    .catchall(z.unknown())

  const parseResult = schema.safeParse(config)

  if (!parseResult.success) {
    const validationError = parseResult.error.errors[0]
    const message = validationError
      ? validationError.message
      : 'Error validating document configuration'
    return Result.error(
      new ChainError({
        message,
        code: RunErrorCodes.DocumentConfigError,
      }),
    )
  }

  const injectResult = injectLatitudeToolsConfig(parseResult.data)
  if (!injectResult.ok) {
    return Result.error(
      new ChainError({
        message: injectResult.error!.message,
        code: RunErrorCodes.DocumentConfigError,
      }),
    )
  }

  return Result.ok(injectResult.unwrap() as Config)
}

const applyAgentTools = (config: Config): Config => {
  const { schema, ...rest } = config

  const DEFAULT_SCHEMA: JSONSchema7 = {
    type: 'object',
    properties: {
      response: {
        type: 'string',
      },
    },
    required: ['response'],
  }

  return {
    ...rest,
    tools: {
      ...(rest.tools ?? {}),
      [AGENT_RETURN_TOOL_NAME]: {
        description:
          'You are an autonomous agent. You have been assigned a task, and your objective is to send messages autonomously following your instructions, obtaining information, and performing actions, indefinitely.\nWith this tool, you will be able to FINISH this workflow. Only use this tool when you have achieved your task and are ready to return the final results.\nUse this tool all by itself, do not include a response with it. If you need to both give a response and run this tool, do it in two separate messages.\nThis tool can ONLY be called once, and it will define the end of your task. Do not try to call it before finishing your task. Do not try to call it multiple times within the same message.\n',
        parameters: schema ?? DEFAULT_SCHEMA,
      },
    },
  }
}

function isChainCompleted(newMessages?: Message[]) {
  if (!newMessages?.length) return false

  const assistantMessage = newMessages[0] as AssistantMessage
  const returnToolCallIds = assistantMessage.toolCalls
    .filter((toolCall) => toolCall.name === AGENT_RETURN_TOOL_NAME)
    .map((toolCall) => toolCall.id)

  const answeredReturnTools = newMessages.slice(1).reduce((acc, message) => {
    if (message.role !== MessageRole.tool) return acc
    if (!Array.isArray(message.content)) return acc

    return message.content.filter(
      (content) =>
        content.type === ContentType.toolResult &&
        returnToolCallIds.includes(content.toolCallId),
    ).length
  }, 0)

  return returnToolCallIds.length > answeredReturnTools
}

export const validateAgentStep = async ({
  workspace,
  providersMap,
  conversation,
  newMessages,
}: ValidatorContext): Promise<
  TypedResult<ValidatedAgentStep, ChainError<RunErrorCodes>>
> => {
  const configResult = validateConfig(conversation.config)
  if (configResult.error) return Result.error(configResult.error)

  const config = configResult.unwrap()
  const providerResult = findProvider(config.provider, providersMap)
  if (providerResult.error) return providerResult

  const provider = providerResult.value
  const freeQuota = await checkFreeProviderQuota({
    workspace,
    provider,
    model: config.model,
  })
  if (freeQuota.error) return freeQuota

  const messages = [...conversation.messages, ...(newMessages ?? [])]

  const rule = applyProviderRules({
    providerType: provider.provider,
    messages,
    config,
  })

  return Result.ok({
    provider,
    config: applyAgentTools(rule.config as Config),
    conversation: {
      ...conversation,
      config: applyAgentTools(config),
      messages: rule?.messages ?? messages,
    },
    chainCompleted: isChainCompleted(newMessages),

    // Agents' "schema" config will be used for the return function, not for the actual LLM output.
    schema: undefined,
    output: 'no-schema',
  })
}
