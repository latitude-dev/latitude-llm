import { eq, getTableColumns, sql } from 'drizzle-orm'

import {
  Commit,
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
        sql`${evaluationResults.resultableType} = ${EvaluationResultableType.Boolean} AND ${evaluationResults.resultableId} = ${evaluationResultableBooleans.id}`,
      )
      .leftJoin(
        evaluationResultableNumbers,
        sql`${evaluationResults.resultableType} = ${EvaluationResultableType.Number} AND ${evaluationResults.resultableId} = ${evaluationResultableNumbers.id}`,
      )
      .leftJoin(
        evaluationResultableTexts,
        sql`${evaluationResults.resultableType} = ${EvaluationResultableType.Text} AND ${evaluationResults.resultableId} = ${evaluationResultableTexts.id}`,
      )
      .where(eq(evaluations.workspaceId, this.workspaceId))
      .as('evaluationResultsBaseQuery')
  }

  async findByDocumentUuid(uuid: string) {
    const result = await this.db
      .select(this.scope._.selectedFields)
      .from(this.scope)
      .innerJoin(documentLogs, eq(documentLogs.id, this.scope.documentLogId))
      .where(eq(documentLogs.documentUuid, uuid))

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
