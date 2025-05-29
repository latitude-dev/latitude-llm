import {
  CompileError,
  Conversation,
  Chain as LegacyChain,
  Message,
} from '@latitude-data/compiler'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import { JSONSchema7 } from 'json-schema'
import { Chain as PromptlChain, Message as PromptlMessage } from 'promptl-ai'
import { z } from 'zod'

import { applyProviderRules, ProviderApiKey, Workspace } from '../../../browser'
import { ChainError } from '../../../lib/chainStreamManager/ChainErrors'
import { checkFreeProviderQuota } from '../checkFreeProviderQuota'
import { CachedApiKeys } from '../run'
import { Result } from './../../../lib/Result'
import { TypedResult } from './../../../lib/Result'
import {
  azureConfig,
  LatitudePromptConfig,
} from '@latitude-data/constants/latitudePromptSchema'

type SomeChain = LegacyChain | PromptlChain

export type ValidatedChainStep = {
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
  promptlVersion: number
  chain: SomeChain
  newMessages: Message[] | undefined
  configOverrides?: ConfigOverrides
  removeSchema?: boolean
}

export const getInputSchema = ({
  config,
  configOverrides,
  ignoreSchema = false,
}: {
  config: LatitudePromptConfig
  configOverrides?: ConfigOverrides
  ignoreSchema?: boolean
}): JSONSchema7 | undefined => {
  if (ignoreSchema) return undefined
  const overrideSchema =
    configOverrides && 'schema' in configOverrides
      ? configOverrides.schema
      : undefined
  return overrideSchema || config.schema
}

export const getOutputType = ({
  config,
  configOverrides,
  ignoreSchema = false,
}: {
  config: LatitudePromptConfig
  configOverrides?: ConfigOverrides
  ignoreSchema?: boolean
}): 'object' | 'array' | 'no-schema' | undefined => {
  if (ignoreSchema) return undefined
  if (configOverrides?.output) return configOverrides.output

  const configSchema = config.schema

  if (!configSchema) return 'no-schema'

  return configSchema.type === 'array' ? 'array' : 'object'
}

/*
 * Legacy compiler wants a string as response for the next step
 * But new Promptl can handle an array of messages
 */
function getTextFromMessages(
  prevContent: Message[] | string | undefined,
): string | undefined {
  if (!prevContent) return undefined
  if (typeof prevContent === 'string') return prevContent

  try {
    return prevContent
      .flatMap((message) => {
        if (typeof message.content === 'string') return message.content
        return JSON.stringify(message.content)
      })
      .join('\n')
  } catch {
    return ''
  }
}

const safeChain = async ({
  promptlVersion,
  chain,
  newMessages,
}: {
  promptlVersion: number
  chain: SomeChain
  newMessages: Message[] | undefined
}) => {
  try {
    if (promptlVersion === 0) {
      let prevText = getTextFromMessages(newMessages)
      const { completed, conversation } = await (chain as LegacyChain).step(
        prevText,
      )
      return Result.ok({ chainCompleted: completed, conversation })
    }

    const { completed, messages, config } = await (chain as PromptlChain).step(
      newMessages as PromptlMessage[] | undefined,
    )

    return Result.ok({
      chainCompleted: completed,
      conversation: { messages, config },
    })
  } catch (e) {
    const error = e as CompileError
    return Result.error(
      new ChainError({
        message: `Error validating chain:\n ${error.message}`,
        code: RunErrorCodes.ChainCompileError,
        details: {
          compileCode: error.code ?? 'unknown_compile_error',
          message: error.message,
        },
      }),
    )
  }
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

// TODO: Use latitudePromptSchema. This is duplicated
// This is a lie
const validateConfig = (
  config: Record<string, unknown>,
): TypedResult<
  LatitudePromptConfig,
  ChainError<RunErrorCodes.DocumentConfigError>
> => {
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

  return Result.ok(parseResult.data)
}

export const validateChain = async ({
  workspace,
  providersMap,
  promptlVersion,
  chain,
  newMessages,
  configOverrides,
  removeSchema,
}: ValidatorContext): Promise<
  TypedResult<ValidatedChainStep, ChainError<RunErrorCodes>>
> => {
  const chainResult = await safeChain({ promptlVersion, chain, newMessages })
  if (chainResult.error) return chainResult

  const { chainCompleted, conversation } = chainResult.value
  const configResult = validateConfig(conversation.config)
  if (configResult.error) return configResult

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

  const rule = applyProviderRules({
    providerType: provider.provider,
    messages: conversation.messages as Message[],
    config,
  })

  const output = removeSchema
    ? 'no-schema'
    : getOutputType({
        config,
        configOverrides,
        ignoreSchema: promptlVersion === 0 && !chainCompleted,
      })
  const schema = removeSchema
    ? undefined
    : getInputSchema({
        config,
        configOverrides,
        ignoreSchema: promptlVersion === 0 && !chainCompleted,
      })

  return Result.ok({
    provider,
    conversation: {
      config: rule.config,
      messages: rule?.messages ?? conversation.messages,
    },
    chainCompleted,
    output,
    schema,
  })
}
