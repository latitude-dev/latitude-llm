import { Conversation, Message } from '@latitude-data/constants'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import { JSONSchema7 } from 'json-schema'
import { Chain as PromptlChain, Message as PromptlMessage } from 'promptl-ai'
import { z } from 'zod'

import { applyProviderRules, ProviderApiKey, Workspace } from '../../../browser'
import { azureConfig, Config, googleConfig } from '../../ai/helpers'
import { ChainError } from '../../../lib/chainStreamManager/ChainErrors'
import { checkFreeProviderQuota } from '../checkFreeProviderQuota'
import { CachedApiKeys } from '../run'
import { Result } from './../../../lib/Result'
import { TypedResult } from './../../../lib/Result'

type SomeChain = PromptlChain

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
  config: Config
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
  config: Config
  configOverrides?: ConfigOverrides
  ignoreSchema?: boolean
}): 'object' | 'array' | 'no-schema' | undefined => {
  if (ignoreSchema) return undefined
  if (configOverrides?.output) return configOverrides.output

  const configSchema = config.schema

  if (!configSchema) return 'no-schema'

  return configSchema.type === 'array' ? 'array' : 'object'
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
      throw new Error('Chains with promptl version 0 are not supported anymore')
    }

    const { completed, messages, config } = await (chain as PromptlChain).step(
      newMessages as PromptlMessage[] | undefined,
    )

    return Result.ok({
      chainCompleted: completed,
      conversation: { messages, config },
    })
  } catch (e) {
    const error = e as Error
    return Result.error(
      new ChainError({
        message: 'Error validating chain',
        code: RunErrorCodes.ChainCompileError,
        details: {
          compileCode: 'unknown_compile_error',
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
    // @ts-expect-error - TODO: fix type incompats
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
