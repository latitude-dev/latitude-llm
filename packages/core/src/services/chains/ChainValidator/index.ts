import {
  CompileError,
  Conversation,
  Chain as LegacyChain,
  Message,
} from '@latitude-data/compiler'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import { JSONSchema7 } from 'json-schema'
import { Chain as PromptlChain } from 'promptl-ai'
import { z } from 'zod'

import { applyProviderRules, ProviderApiKey, Workspace } from '../../../browser'
import { Result, TypedResult } from '../../../lib'
import { Config } from '../../ai'
import { azureConfig, googleConfig } from '../../ai/helpers'
import { ChainError } from '../ChainErrors'
import { checkFreeProviderQuota } from '../checkFreeProviderQuota'
import { CachedApiKeys } from '../run'

type SomeChain = LegacyChain | PromptlChain

export type ValidatedChainStep = {
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
  prevText: string | undefined
  chain: SomeChain
  promptlVersion: number
  providersMap: CachedApiKeys
  configOverrides?: ConfigOverrides
  removeSchema?: boolean
}

const getInputSchema = ({
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

const getOutputType = ({
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
  prevText,
}: {
  promptlVersion: number
  chain: SomeChain
  prevText: string | undefined
}) => {
  try {
    if (promptlVersion === 0) {
      const { completed, conversation } = await (chain as LegacyChain).step(
        prevText,
      )
      return Result.ok({ chainCompleted: completed, conversation })
    }
    const { completed, messages, config } = await (chain as PromptlChain).step(
      prevText,
    )
    return Result.ok({
      chainCompleted: completed,
      conversation: { messages, config },
    })
  } catch (e) {
    const error = e as CompileError
    return Result.error(
      new ChainError({
        message: 'Error validating chain',
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

  const result = schema.safeParse(config)

  if (!result.success) {
    const validationError = result.error.errors[0]
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

  return Result.ok(result.data)
}

export const validateChain = async (
  context: ValidatorContext,
): Promise<TypedResult<ValidatedChainStep, ChainError<RunErrorCodes>>> => {
  const {
    workspace,
    promptlVersion,
    prevText,
    chain,
    providersMap,
    configOverrides,
    removeSchema,
  } = context
  const chainResult = await safeChain({ promptlVersion, chain, prevText })
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

  const schema = getInputSchema({
    config,
    configOverrides,
    ignoreSchema: promptlVersion === 0 && !chainCompleted,
  })
  const output = getOutputType({
    config,
    configOverrides,
    ignoreSchema: promptlVersion === 0 && !chainCompleted,
  })

  return Result.ok({
    provider,
    config: rule.config as Config,
    chainCompleted,
    conversation: {
      ...conversation,
      messages: rule?.messages ?? conversation.messages,
    },

    ...(removeSchema
      ? {
          // Schema is removed when called from an Agent, as this configuration is reserved for the return function.
          schema: undefined,
          output: 'no-schema',
        }
      : {
          schema,
          output,
        }),
  })
}
