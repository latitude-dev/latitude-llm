import { Chain, CompileError, Conversation } from '@latitude-data/compiler'
import { z } from 'zod'

import { ProviderApiKey } from '../../../browser'
import { RunErrorCodes } from '../../../constants'
import { Result, TypedResult } from '../../../lib'
import { Config } from '../../ai'
import { ChainError } from '../ChainErrors'
import { CachedApiKeys } from '../run'

export type ValidatedStep = {
  config: Config
  provider: ProviderApiKey
  conversation: Conversation
  chainCompleted: boolean
}

export class ChainValidator {
  private prevText: string | undefined
  private chain: Chain
  private providersMap: CachedApiKeys

  constructor({
    prevText,
    chain,
    providersMap,
  }: {
    prevText: string | undefined
    chain: Chain
    providersMap: CachedApiKeys
  }) {
    this.prevText = prevText
    this.chain = chain
    this.providersMap = providersMap
  }

  async call() {
    const chainResult = await this.safeChain()
    if (chainResult.error) return chainResult

    const { chainCompleted, conversation } = chainResult.unwrap()

    const configResult = this.validateConfig(conversation.config)
    if (configResult.error) return configResult

    const config = configResult.unwrap()
    const providerResult = this.findProvider(config.provider)

    if (providerResult.error) return providerResult

    return Result.ok({
      provider: providerResult.unwrap(),
      config,
      chainCompleted,
      conversation,
    })
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

    return Result.error(
      new ChainError({
        message: `Provider API Key with Id ${name} not found. Did you forget to add it to the workspace?`,
        code: RunErrorCodes.MissingProvider,
      }),
    )
  }

  validateConfig(
    config: Record<string, unknown>,
  ): TypedResult<Config, ChainError<RunErrorCodes.DocumentConfigError>> {
    const schema = z
      .object({
        model: z.string(),
        provider: z.string(),
        google: z
          .object({
            structuredOutputs: z.boolean().optional(),
            cachedContent: z.string().optional(),
            safetySettings: z
              .array(
                z
                  .object({
                    category: z.string().optional(), // TODO: can be an enum
                    threshold: z.string().optional(), // TODO: can be an enum
                  })
                  .optional(),
              )
              .optional(),
          })
          .optional(),
        azure: z
          .object({
            resourceName: z.string(),
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
