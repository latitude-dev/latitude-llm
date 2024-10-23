import { createChain as createChainFn } from '@latitude-data/compiler'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import { JSONSchema7 } from 'json-schema'

import {
  DocumentLog,
  ErrorableEntity,
  EvaluationDto,
  EvaluationResultableType,
  WorkspaceDto,
} from '../../../browser'
import { Database } from '../../../client'
import { findWorkspaceFromDocumentLog } from '../../../data-access'
import { Result } from '../../../lib'
import { ChainError } from '../../chains/ChainErrors'
import { serialize } from '../../documentLogs/serialize'
import { createRunError } from '../../runErrors/create'

type EvaluationRunErrorCheckerCodes =
  | RunErrorCodes.EvaluationRunMissingProviderLogError
  | RunErrorCodes.EvaluationRunMissingWorkspaceError
  | RunErrorCodes.EvaluationRunUnsupportedResultTypeError
  | RunErrorCodes.ChainCompileError
  | RunErrorCodes.Unknown

function getResultSchema(type: EvaluationResultableType) {
  switch (type) {
    case EvaluationResultableType.Boolean:
      return Result.ok({ type: 'boolean' })
    case EvaluationResultableType.Number:
      return Result.ok({ type: 'number' })
    case EvaluationResultableType.Text:
      return Result.ok({ type: 'string' })
    default:
      return Result.error(
        new ChainError({
          message: `Unsupported evaluation type '${type}'`,
          code: RunErrorCodes.EvaluationRunUnsupportedResultTypeError,
        }),
      )
  }
}

export class EvaluationRunChecker {
  private errorableUuid: string
  private documentLog: DocumentLog
  private evaluation: EvaluationDto
  private db: Database

  constructor({
    db,
    errorableUuid,
    documentLog,
    evaluation,
  }: {
    db: Database
    errorableUuid: string
    documentLog: DocumentLog
    evaluation: EvaluationDto
  }) {
    this.db = db
    this.errorableUuid = errorableUuid
    this.documentLog = documentLog
    this.evaluation = evaluation
  }

  async call() {
    const workspaceResult = await this.findWorkspace()

    if (workspaceResult.error) return workspaceResult
    const workspace = workspaceResult.value

    const chainResult = await this.createChain(workspace)
    if (chainResult.error) return chainResult

    const schemaResult = await this.buildSchema()
    if (schemaResult.error) return schemaResult

    return Result.ok({
      workspace,
      chain: chainResult.value,
      schema: schemaResult.value,
    })
  }

  private async buildSchema() {
    const resultSchema = getResultSchema(
      (this.evaluation.configuration ?? this.evaluation.metadata.configuration)!
        .type,
    )

    if (resultSchema.error) {
      await this.saveError(resultSchema.error)
      return resultSchema
    }

    return Result.ok({
      type: 'object',
      properties: {
        result: resultSchema.value,
        reason: { type: 'string' },
      },
      required: ['result', 'reason'],
    } as JSONSchema7)
  }

  private async createChain(workspace: WorkspaceDto) {
    const serializedLogResult = await this.serializeDocumentLog(workspace)

    if (serializedLogResult.error) return serializedLogResult

    try {
      return Result.ok(
        createChainFn({
          prompt: this.evaluation.metadata.prompt,
          parameters: {
            ...serializedLogResult.value,
          },
        }),
      )
    } catch (e) {
      const err = e as Error
      const error = new ChainError({
        code: RunErrorCodes.ChainCompileError,
        message: `Error compiling evaluation prompt ${this.evaluation.name} with ID: ${this.evaluation.id} while running evaluation: ${err.message}`,
      })
      return Result.error(error)
    }
  }

  private async serializeDocumentLog(workspace: WorkspaceDto) {
    try {
      const serializedDocumentLogResult = await serialize(
        { workspace, documentLog: this.documentLog },
        this.db,
      )

      if (serializedDocumentLogResult.error) {
        const error = new ChainError({
          code: RunErrorCodes.EvaluationRunMissingProviderLogError,
          message: `Could not serialize documentLog ${this.documentLog.uuid}. No provider logs found.`,
        })
        await this.saveError(error)
        return Result.error(error)
      }

      return Result.ok(serializedDocumentLogResult.value)
    } catch (e) {
      const err = e as Error
      const error = new ChainError({
        code: RunErrorCodes.EvaluationRunMissingProviderLogError,
        message: `Error serializing documentLog ${this.documentLog.uuid} while running evaluation: ${err.message}`,
      })
      await this.saveError(error)
      return Result.error(error)
    }
  }

  async findWorkspace() {
    const workspace = await findWorkspaceFromDocumentLog(this.documentLog)
    if (workspace) return Result.ok(workspace)

    const error = new ChainError({
      code: RunErrorCodes.EvaluationRunMissingWorkspaceError,
      message: `Workspace not found for documentLogUuid ${this.documentLog.uuid}`,
    })
    await this.saveError(error)

    return Result.error(error)
  }

  private async saveError(error: ChainError<EvaluationRunErrorCheckerCodes>) {
    await createRunError({
      data: {
        errorableUuid: this.errorableUuid,
        errorableType: ErrorableEntity.EvaluationResult,
        code: error.errorCode,
        message: error.message,
        details: error.details,
      },
    }).then((r) => r.unwrap())
  }
}
