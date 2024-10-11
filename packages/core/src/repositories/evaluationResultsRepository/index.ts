import {
  and,
  desc,
  eq,
  getTableColumns,
  isNotNull,
  isNull,
  sql,
} from 'drizzle-orm'

import {
  Commit,
  ErrorableEntity,
  EvaluationResult,
  EvaluationResultableType,
} from '../../browser'
import { Result } from '../../lib'
import {
  documentLogs,
  evaluationResultableBooleans,
  evaluationResultableNumbers,
  evaluationResultableTexts,
  evaluationResults,
  evaluations,
  runErrors,
} from '../../schema'
import Repository from '../repository'

export const evaluationResultDto = {
  ...getTableColumns(evaluationResults),
  result: sql<string>`
    CASE
      WHEN ${evaluationResults.resultableType} = ${EvaluationResultableType.Boolean} THEN ${evaluationResultableBooleans.result}::text
      WHEN ${evaluationResults.resultableType} = ${EvaluationResultableType.Number} THEN ${evaluationResultableNumbers.result}::text
      WHEN ${evaluationResults.resultableType} = ${EvaluationResultableType.Text} THEN ${evaluationResultableTexts.result}
    END
  `.as('result'),
}

export type EvaluationResultDto = EvaluationResult & {
  result: string | number | boolean
}

export type EvaluationResultWithMetadata = EvaluationResultDto & {
  commit: Commit
  tokens: number | null
  costInMillicents: number | null
  documentContentHash: string
}

export class EvaluationResultsRepository extends Repository<
  typeof evaluationResultDto,
  EvaluationResultDto
> {
  get scope() {
    return this.db
      .select(evaluationResultDto)
      .from(evaluationResults)
      .innerJoin(
        evaluations,
        eq(evaluations.id, evaluationResults.evaluationId),
      )
      .leftJoin(
        evaluationResultableBooleans,
        and(
          eq(
            evaluationResults.resultableType,
            EvaluationResultableType.Boolean,
          ),
          eq(evaluationResults.resultableId, evaluationResultableBooleans.id),
        ),
      )
      .leftJoin(
        evaluationResultableNumbers,
        and(
          eq(evaluationResults.resultableType, EvaluationResultableType.Number),
          eq(evaluationResults.resultableId, evaluationResultableNumbers.id),
        ),
      )
      .leftJoin(
        evaluationResultableTexts,
        and(
          eq(evaluationResults.resultableType, EvaluationResultableType.Text),
          eq(evaluationResults.resultableId, evaluationResultableTexts.id),
        ),
      )
      .leftJoin(
        runErrors,
        and(
          eq(runErrors.errorableUuid, evaluationResults.uuid),
          eq(runErrors.errorableType, ErrorableEntity.EvaluationResult),
        ),
      )
      .where(
        and(
          isNull(runErrors.id),
          isNotNull(evaluationResults.resultableId),
          isNotNull(evaluationResults.providerLogId),
          eq(evaluations.workspaceId, this.workspaceId),
        ),
      )
      .as('evaluationResultsBaseQuery')
  }

  async findByContentHash({
    evaluationId,
    contentHash,
  }: {
    evaluationId: number
    contentHash: string
  }) {
    const result = await this.db
      .select(this.scope._.selectedFields)
      .from(this.scope)
      .innerJoin(documentLogs, eq(documentLogs.id, this.scope.documentLogId))
      .where(
        and(
          eq(this.scope.evaluationId, evaluationId),
          eq(documentLogs.contentHash, contentHash),
        ),
      )
      .orderBy(desc(this.scope.createdAt))

    return Result.ok(result.map(this.parseResult))
  }

  private parseResult(row: EvaluationResult & { result: string }) {
    const { result, resultableType, ...rest } = row

    let parsedResult
    switch (resultableType) {
      case EvaluationResultableType.Boolean:
        parsedResult = result.toLowerCase() === 'true'
        break
      case EvaluationResultableType.Number:
        parsedResult = parseFloat(result)
        break
      default:
        parsedResult = result
    }

    return {
      ...rest,
      resultableType,
      result: parsedResult,
    }
  }
}
