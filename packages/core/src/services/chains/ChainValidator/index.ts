import {
  ChainError,
  PaymentRequiredError,
  RunErrorCodes,
} from '@latitude-data/constants/errors'
import type { Message } from '@latitude-data/constants/messages'
import { JSONSchema7 } from 'json-schema'
import { Chain as PromptlChain, Message as PromptlMessage } from 'promptl-ai'
import { z } from 'zod'
import {
  azureConfig,
  LatitudePromptConfig,
} from '@latitude-data/constants/latitudePromptSchema'
import { CompileError as PromptlCompileError } from 'promptl-ai'
import { applyProviderRules } from '../../ai/providers/rules'
import { type ProviderApiKey } from '../../../schema/models/types/ProviderApiKey'
import { type WorkspaceDto } from '../../../schema/models/types/Workspace'
import { Result, TypedResult } from '../../../lib/Result'
import { Output } from '../../../lib/streamManager/step/streamAIResponse'
import { checkFreeProviderQuota } from '../checkFreeProviderQuota'
import { CachedApiKeys } from '../run'
import { DocumentType } from '@latitude-data/constants'
import { checkPayingOrTrial } from '../../../lib/checkPayingOrTrial'

const DEFAULT_AGENT_MAX_STEPS = 20

type JSONOverride = { schema: JSONSchema7; output: 'object' | 'array' }
type ValidatorContext = {
  workspace: WorkspaceDto
  providersMap: CachedApiKeys
  chain: PromptlChain
  newMessages: Message[] | undefined
  configOverrides?: ConfigOverrides
}

export type ValidatedChainStep = {
  provider: ProviderApiKey
  config: LatitudePromptConfig
  messages: Message[]
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

export const validateChain = async ({
  workspace,
  providersMap,
  chain,
  newMessages,
  configOverrides,
}: ValidatorContext): Promise<
  TypedResult<ValidatedChainStep, ChainError<RunErrorCodes>>
> => {
  try {
    const chainResult = await getChainNextStep({ chain, newMessages })
    if (chainResult.error) return chainResult

    const { chainCompleted, conversation } = chainResult.value
    const config = applyAgentRule(
      validateConfig(conversation.config as LatitudePromptConfig).unwrap(),
    )

    const provider = findProvider(config.provider, providersMap).unwrap()

    checkPayingOrTrial({
      subscription: workspace.currentSubscription,
    }).unwrap()

    await checkFreeProviderQuota({
      workspace,
      provider,
      model: config.model,
    }).then((r) => r.unwrap())

    const rule = applyProviderRules({
      providerType: provider.provider,
      // TODO(compiler): review this casting
      messages: conversation.messages as unknown as Message[],
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
      chainCompleted,
      config: rule.config as LatitudePromptConfig,
      messages: rule?.messages ?? conversation.messages,
      output,
      provider,
      schema,
    })
  } catch (e) {
    if (e instanceof ChainError) {
      return Result.error(e)
    } else if (e instanceof PaymentRequiredError) {
      return Result.error(
        new ChainError({
          code: RunErrorCodes.PaymentRequiredError,
          message: e.message,
        }),
      )
    } else {
      return Result.error(
        new ChainError({
          code: RunErrorCodes.Unknown,
          message: (e as Error).message,
        }),
      )
    }
  }
}

export function applyAgentRule(config: LatitudePromptConfig) {
  // Don't apply maxSteps if user explicitly set type: prompt
  if (config.type === DocumentType.Prompt) return config

  // Don't apply maxSteps if already set
  if ('maxSteps' in config) return config

  return {
    ...config,
    maxSteps: DEFAULT_AGENT_MAX_STEPS,
  }
}

async function getChainNextStep({
  chain,
  newMessages,
}: {
  chain: PromptlChain
  newMessages: Message[] | undefined
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
    const validationError = parseResult.error.issues[0]
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
