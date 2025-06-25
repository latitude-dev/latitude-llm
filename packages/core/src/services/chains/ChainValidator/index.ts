import { Message } from '@latitude-data/constants/legacyCompiler'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { JSONSchema7 } from 'json-schema'
import { Chain as PromptlChain, Message as PromptlMessage } from 'promptl-ai'
import { z } from 'zod'

import { applyProviderRules, ProviderApiKey, Workspace } from '../../../browser'
import { checkFreeProviderQuota } from '../checkFreeProviderQuota'
import { CachedApiKeys } from '../run'
import { Result } from './../../../lib/Result'
import { TypedResult } from './../../../lib/Result'
import {
  azureConfig,
  LatitudePromptConfig,
} from '@latitude-data/constants/latitudePromptSchema'
import { CompileError as PromptlCompileError } from 'promptl-ai'
import { Output } from '../../../lib/streamManager/step/streamAIResponse'

export type ValidatedChainStep = {
  provider: ProviderApiKey
  config: LatitudePromptConfig
  messages: Message[]
  chainCompleted: boolean
  schema?: JSONSchema7
  output?: 'object' | 'array' | 'no-schema'
}

type JSONOverride = { schema: JSONSchema7; output: 'object' | 'array' }
export type ConfigOverrides = JSONOverride | { output: 'no-schema' }

type ValidatorContext = {
  workspace: Workspace
  providersMap: CachedApiKeys
  chain: PromptlChain
  newMessages: Message[] | undefined
  configOverrides?: ConfigOverrides
  removeSchema?: boolean
}

export const getInputSchema = ({
  config,
  configOverrides,
}: {
  config: LatitudePromptConfig
  configOverrides?: ConfigOverrides
}): JSONSchema7 | undefined => {
  const overrideSchema =
    configOverrides && 'schema' in configOverrides
      ? configOverrides.schema
      : undefined
  return overrideSchema || config.schema
}

export const getOutputType = ({
  config,
  configOverrides,
}: {
  config: LatitudePromptConfig
  configOverrides?: ConfigOverrides
}): Output | undefined => {
  if (configOverrides?.output) return configOverrides.output

  const configSchema = config.schema
  if (!configSchema) return 'no-schema'

  return configSchema.type === 'array' ? 'array' : 'object'
}

const safeChain = async ({
  chain,
  newMessages,
}: {
  chain: PromptlChain
  newMessages: Message[] | undefined
}) => {
  try {
    const { completed, messages, config } = await (chain as PromptlChain).step(
      newMessages as PromptlMessage[] | undefined,
    )

    return Result.ok({
      chainCompleted: completed,
      conversation: { messages, config },
    })
  } catch (e) {
    const error = e as PromptlCompileError
    const isCompileError = error instanceof PromptlCompileError
    return Result.error(
      new ChainError({
        message: `Error validating chain:\n ${error.message}`,
        code: RunErrorCodes.ChainCompileError,
        details: {
          compileCode: error.code ?? 'unknown_compile_error',
          message: error.message,
          ...(isCompileError
            ? {
                compileCode: error.code,
                frame: error.frame,
              }
            : {}),
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
  config: LatitudePromptConfig,
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

export const renderChain = async ({
  workspace,
  providersMap,
  chain,
  newMessages,
  configOverrides,
  removeSchema,
}: ValidatorContext): Promise<
  TypedResult<ValidatedChainStep, ChainError<RunErrorCodes>>
> => {
  const chainResult = await safeChain({ chain, newMessages })
  if (chainResult.error) return chainResult

  const { chainCompleted, conversation } = chainResult.value
  const configResult = validateConfig(
    conversation.config as LatitudePromptConfig,
  )
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
    // TODO(compiler): fix types
    messages: conversation.messages as unknown as Message[],
    config,
  })

  const output = removeSchema
    ? 'no-schema'
    : getOutputType({
        config,
        configOverrides,
      })
  const schema = removeSchema
    ? undefined
    : getInputSchema({
        config,
        configOverrides,
      })

  return Result.ok({
    provider,
    config: rule.config as LatitudePromptConfig,
    messages: rule?.messages ?? conversation.messages,
    chainCompleted,
    output,
    schema,
  })
}
