import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNotNull,
  isNull,
  sql,
} from 'drizzle-orm'

import {
  Commit,
  ErrorableEntity,
  EvaluationDto,
  EvaluationResultableType,
  EvaluationResultDto,
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
import Repository from '../repositoryV2'

const { providerLogId: _providerLogId, ...tt } =
  getTableColumns(evaluationResults)

export const evaluationResultDto = {
  ...tt,
  result: sql<string>`
    CASE
      WHEN ${evaluationResults.resultableType} = ${EvaluationResultableType.Boolean} THEN ${evaluationResultableBooleans.result}::text
      WHEN ${evaluationResults.resultableType} = ${EvaluationResultableType.Number} THEN ${evaluationResultableNumbers.result}::text
      WHEN ${evaluationResults.resultableType} = ${EvaluationResultableType.Text} THEN ${evaluationResultableTexts.result}
    END
  `.as('result'),
}

export type EvaluationResultByDocument = Pick<
  EvaluationResultDto,
  'id' | 'result' | 'createdAt' | 'source'
> & {
  sameContent: boolean
}

export type EvaluationResultWithMetadata = EvaluationResultDto & {
  commit: Commit
  tokens: number | null
  costInMillicents: number | null
  documentContentHash: string
}

export type ResultWithEvaluation = {
  result: EvaluationResultDto
  evaluation: EvaluationDto
}

export class EvaluationResultsRepository extends Repository<EvaluationResultDto> {
  get scope() {
    return this.db
      .select(evaluationResultDto)
      .from(evaluationResults)
      .innerJoin(
        evaluations,
        and(
          isNull(evaluations.deletedAt),
          eq(evaluations.id, evaluationResults.evaluationId),
        ),
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
          isNotNull(evaluationResults.evaluatedProviderLogId),
          eq(evaluations.workspaceId, this.workspaceId),
        ),
      )
      .$dynamic()
  }

  async findByContentHash({
    evaluationId,
    contentHash,
  }: {
    evaluationId: number
    contentHash: string
  }) {
    const results = await this.scope
      .innerJoin(
        documentLogs,
        eq(documentLogs.id, evaluationResults.documentLogId),
      )
      .where(
        and(
          eq(evaluationResults.evaluationId, evaluationId),
          eq(documentLogs.contentHash, contentHash),
        ),
      )
      .orderBy(desc(evaluationResults.createdAt))

    return Result.ok(results.map(EvaluationResultsRepository.parseResult))
  }

  async findByDocumentLogIds(documentLogIds: number[]) {
    const results = await this.scope
      .where(
        and(
          isNull(runErrors.id),
          isNotNull(evaluationResults.resultableId),
          isNotNull(evaluationResults.evaluatedProviderLogId),
          inArray(evaluationResults.documentLogId, documentLogIds),
          eq(evaluations.workspaceId, this.workspaceId),
        ),
      )
      .orderBy(desc(evaluationResults.updatedAt))

    return Result.ok(results.map(EvaluationResultsRepository.parseResult))
  }

  async totalCountSinceDate(minDate: Date) {
    const result = await this.db
      .select({
        count: count(evaluationResults.id),
      })
      .from(evaluationResults)
      .innerJoin(
        evaluations,
        and(
          eq(evaluations.id, evaluationResults.evaluationId),
          eq(evaluations.workspaceId, this.workspaceId),
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
        and(isNull(runErrors.id), gte(evaluationResults.createdAt, minDate)),
      )

    return result[0]?.count ?? 0
  }

  static parseResult(row: EvaluationResultDto & { result: string }) {
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
