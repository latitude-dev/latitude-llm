import { Chain, CompileError, Conversation } from '@latitude-data/compiler'
import { JSONSchema7 } from 'json-schema'
import { z } from 'zod'

import { applyCustomRules, ProviderApiKey, Workspace } from '../../../browser'
import { RunErrorCodes } from '../../../constants'
import { Result, TypedResult } from '../../../lib'
import { Config } from '../../ai'
import { googleConfig } from '../../ai/helpers'
import { ChainError } from '../ChainErrors'
import { checkFreeProviderQuota } from '../checkFreeProviderQuota'
import { CachedApiKeys } from '../run'

export type ValidatedStep = {
  config: Config
  provider: ProviderApiKey
  conversation: Conversation
  chainCompleted: boolean
  schema?: JSONSchema7
  output?: 'object' | 'array' | 'no-schema'
}

type JSONOverride = { schema: JSONSchema7; output: 'object' | 'array' }
export type ConfigOverrides = JSONOverride | { output: 'no-schema' }

export class ChainValidator {
  private workspace: Workspace
  private prevText: string | undefined
  private chain: Chain
  private providersMap: CachedApiKeys
  private configOverrides?: ConfigOverrides

  constructor({
    workspace,
    prevText,
    chain,
    providersMap,
    configOverrides,
  }: {
    workspace: Workspace
    prevText: string | undefined
    chain: Chain
    providersMap: CachedApiKeys
    configOverrides?: ConfigOverrides
  }) {
    this.workspace = workspace
    this.prevText = prevText
    this.chain = chain
    this.providersMap = providersMap
    this.configOverrides = configOverrides
  }

  async call() {
    const chainResult = await this.safeChain()
    if (chainResult.error) return chainResult

    const { chainCompleted, conversation } = chainResult.value
    const configResult = this.validateConfig(conversation.config)
    if (configResult.error) return configResult

    const config = configResult.unwrap()
    const providerResult = this.findProvider(config.provider)
    if (providerResult.error) return providerResult

    const provider = providerResult.value
    const freeQuota = await checkFreeProviderQuota({
      workspace: this.workspace,
      provider,
      model: config.model,
    })
    if (freeQuota.error) return freeQuota

    const rule = applyCustomRules({
      providerType: provider.provider,
      messages: conversation.messages,
    })

    return Result.ok({
      provider,
      config,
      chainCompleted,
      conversation: {
        ...conversation,
        messages: rule?.messages ?? conversation.messages,
      },
      schema: this.getInputSchema(chainCompleted, config),
      output: this.getOutputType(chainCompleted, config),
    })
  }

  private getInputSchema(
    chainCompleted: boolean,
    config: Config,
  ): JSONSchema7 | undefined {
    if (!chainCompleted) return undefined
    const override = this.configOverrides
    const overrideSchema =
      override && 'schema' in override ? override.schema : undefined
    return overrideSchema || config.schema
  }

  private getOutputType(
    chainCompleted: boolean,
    config: Config,
  ): 'object' | 'array' | 'no-schema' | undefined {
    if (!chainCompleted) return undefined

    if (this.configOverrides?.output) return this.configOverrides.output

    const configSchema = config.schema

    if (!configSchema) return 'no-schema'

    return configSchema.type === 'array' ? 'array' : 'object'
  }

  private async safeChain() {
    try {
      const { completed, conversation } = await this.chain.step(this.prevText)
      return Result.ok({ chainCompleted: completed, conversation })
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

  private findProvider(name: string) {
    const provider = this.providersMap.get(name)
    if (provider) return Result.ok(provider)

    const settingUrl = 'https://app.latitude.so/settings'
    return Result.error(
      new ChainError({
        message: `Provider API Key with name ${name} not found. Go to ${settingUrl} to add a new provider if there is not one already with that name.`,
        code: RunErrorCodes.MissingProvider,
      }),
    )
  }

  validateConfig(
    config: Record<string, unknown>,
  ): TypedResult<Config, ChainError<RunErrorCodes.DocumentConfigError>> {
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
        google: googleConfig,
        azure: z
          .object({
            resourceName: z.string({
              message: 'Azure resourceName is required',
            }),
          })
          .optional(),
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
}
