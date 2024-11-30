import {
  createChain as createLegacyChain,
  readMetadata,
  ReferencePromptFn,
} from '@latitude-data/compiler'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import { Adapters, Chain as PromptlChain, scan } from '@latitude-data/promptl'

import { DocumentVersion, ErrorableEntity } from '../../../browser'
import { Result } from '../../../lib'
import { ChainError } from '../../chains/ChainErrors'
import { createRunError } from '../../runErrors/create'

type RunDocumentErrorCodes = RunErrorCodes.ChainCompileError

export class RunDocumentChecker {
  private document: DocumentVersion
  private errorableUuid: string
  private prompt: string
  private referenceFn?: ReferencePromptFn
  private parameters: Record<string, unknown>

  constructor({
    document,
    errorableUuid,
    prompt,
    referenceFn,
    parameters,
  }: {
    document: DocumentVersion
    errorableUuid: string
    prompt: string
    referenceFn?: ReferencePromptFn
    parameters: Record<string, unknown>
  }) {
    this.document = document
    this.errorableUuid = errorableUuid
    this.prompt = prompt
    this.referenceFn = referenceFn
    this.parameters = parameters
  }

  async call() {
    const chainResult = await this.createChain()
    if (chainResult.error) return chainResult

    return Result.ok({
      chain: chainResult.value,
    })
  }

  private async createChain() {
    try {
      if (this.document.promptlVersion === 0) {
        const metadata = await readMetadata({
          prompt: this.prompt,
          fullPath: this.document.path,
          referenceFn: this.referenceFn,
        })

        return Result.ok(
          createLegacyChain({
            prompt: metadata.resolvedPrompt,
            parameters: this.parameters,
          }),
        )
      } else {
        const metadata = await scan({
          prompt: this.prompt,
          fullPath: this.document.path,
          referenceFn: this.referenceFn,
        })

        return Result.ok(
          new PromptlChain({
            prompt: metadata.resolvedPrompt,
            parameters: this.processParameters(this.parameters),
            adapter: Adapters.default,
          }),
        )
      }
    } catch (e) {
      const err = e as Error
      const error = new ChainError({
        code: RunErrorCodes.ChainCompileError,
        message: `Error compiling prompt for document uuid: ${this.document.documentUuid} - ${err.message}`,
      })
      await this.saveError(error)
      return Result.error(error)
    }
  }

  private async saveError(error: ChainError<RunDocumentErrorCodes>) {
    await createRunError({
      data: {
        errorableUuid: this.errorableUuid,
        errorableType: ErrorableEntity.DocumentLog,
        code: error.errorCode,
        message: error.message,
        details: error.details,
      },
    }).then((r) => r.unwrap())
  }

  private processParameters(
    parameters: Record<string, unknown>,
  ): Record<string, unknown> {
    const result = Object.entries(parameters).reduce(
      (acc, [key, value]) => {
        if (typeof value === 'string') {
          try {
            acc[key] = JSON.parse(value as string)
          } catch (e) {
            acc[key] = value
          }
        } else {
          acc[key] = value
        }

        return acc
      },
      {} as Record<string, unknown>,
    )

    return result
  }
}
