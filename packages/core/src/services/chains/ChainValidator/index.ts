import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { Message as LegacyMessage } from '@latitude-data/constants/legacyCompiler'
import { JSONSchema7 } from 'json-schema'
import { Chain as PromptlChain, Message as PromptlMessage } from 'promptl-ai'
import { z } from 'zod'

import {
  azureConfig,
  LatitudePromptConfig,
} from '@latitude-data/constants/latitudePromptSchema'
import { CompileError as PromptlCompileError } from 'promptl-ai'
import { applyProviderRules, ProviderApiKey, Workspace } from '../../../browser'
import { Result, TypedResult } from '../../../lib/Result'
import { Output } from '../../../lib/streamManager/step/streamAIResponse'
import { checkFreeProviderQuota } from '../checkFreeProviderQuota'
import { CachedApiKeys } from '../run'
import isNumber from 'lodash-es/isNumber'

const DEFAULT_AGENT_MAX_STEPS = 20

type JSONOverride = { schema: JSONSchema7; output: 'object' | 'array' }
type ValidatorContext = {
  workspace: Workspace
  providersMap: CachedApiKeys
  chain: PromptlChain
  newMessages: LegacyMessage[] | undefined
  configOverrides?: ConfigOverrides
}

export type ValidatedChainStep = {
  provider: ProviderApiKey
  config: LatitudePromptConfig
  messages: LegacyMessage[]
  chainCompleted: boolean
  schema?: JSONSchema7
  output?: 'object' | 'array' | 'no-schema'
}

export type ConfigOverrides = JSONOverride | { output: 'no-schema' }

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

export const renderChain = async ({
  workspace,
  providersMap,
  chain,
  newMessages,
  configOverrides,
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

  const config = applyAgentRule(configResult.unwrap())
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
    // TODO(compiler): review this casting
    messages: conversation.messages as unknown as LegacyMessage[],
    config,
  })

  const output = getOutputType({
    config,
    configOverrides,
  })
  const schema = getInputSchema({
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

function applyAgentRule(config: LatitudePromptConfig) {
  if (config.type !== 'agent') return config
  if ('maxSteps' in config && isNumber(config.maxSteps) && config.maxSteps > 0)
    return config

  return {
    ...config,
    maxSteps: DEFAULT_AGENT_MAX_STEPS,
  }
}

async function safeChain({
  chain,
  newMessages,
}: {
  chain: PromptlChain
  newMessages: LegacyMessage[] | undefined
}) {
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

function findProvider(name: string, providersMap: CachedApiKeys) {
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

function validateConfig(
  config: LatitudePromptConfig,
): TypedResult<
  LatitudePromptConfig,
  ChainError<RunErrorCodes.DocumentConfigError>
> {
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
