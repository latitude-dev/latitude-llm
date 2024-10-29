import { createChain as createChainFn } from '@latitude-data/compiler'
import { RunErrorCodes } from '@latitude-data/constants/errors'

import { DocumentVersion, ErrorableEntity } from '../../../browser'
import { Result } from '../../../lib'
import { ChainError } from '../../chains/ChainErrors'
import { createRunError } from '../../runErrors/create'

type RunDocumentErrorCodes = RunErrorCodes.ChainCompileError

export class RunDocumentChecker {
  private document: DocumentVersion
  private errorableUuid: string
  private prompt: string
  private parameters: Record<string, unknown>

  constructor({
    document,
    errorableUuid,
    prompt,
    parameters,
  }: {
    document: DocumentVersion
    errorableUuid: string
    prompt: string
    parameters: Record<string, unknown>
  }) {
    this.document = document
    this.errorableUuid = errorableUuid
    this.prompt = prompt
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
      return Result.ok(
        createChainFn({
          prompt: this.prompt,
          parameters: this.parameters,
        }),
      )
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
}
