import { subDays } from 'date-fns'
import {
  and,
  asc,
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
  EVALUATION_RESULT_RECENCY_DAYS,
  EvaluationDto,
  EvaluationResultableType,
  EvaluationResultDto,
  MAX_EVALUATION_RESULTS_PER_DOCUMENT_SUGGESTION,
} from '../../browser'
import { Result } from '../../lib'
import {
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
  get scopeFilter() {
    return and(
      isNull(runErrors.id),
      isNotNull(evaluationResults.resultableId),
      isNotNull(evaluationResults.evaluatedProviderLogId),
      eq(evaluations.workspaceId, this.workspaceId),
    )
  }

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
      .where(this.scopeFilter)
      .$dynamic()
  }

  async findByDocumentLogIds(documentLogIds: number[]) {
    const results = await this.scope
      .where(
        and(
          this.scopeFilter,
          inArray(evaluationResults.documentLogId, documentLogIds),
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
      .where(and(this.scopeFilter, gte(evaluationResults.createdAt, minDate)))

    return result[0]?.count ?? 0
  }

  async selectForDocumentSuggestion(evaluationId: number) {
    // Note: enhance selection in evaluations 2.0
    const results = await this.scope
      .where(
        and(
          this.scopeFilter,
          eq(evaluationResults.evaluationId, evaluationId),
          gte(
            evaluationResults.updatedAt,
            subDays(new Date(), EVALUATION_RESULT_RECENCY_DAYS),
          ),
        ),
      )
      .orderBy(
        asc(evaluationResultDto.result),
        desc(evaluationResults.updatedAt),
      )
      .limit(MAX_EVALUATION_RESULTS_PER_DOCUMENT_SUGGESTION)

    return Result.ok(results.map(EvaluationResultsRepository.parseResult))
  }

  static parseResult(row: EvaluationResultDto) {
    const { result, resultableType, ...rest } = row

    let parsedResult
    switch (resultableType) {
      case EvaluationResultableType.Boolean:
        parsedResult = (result as string).toLowerCase() === 'true'
        break
      case EvaluationResultableType.Number:
        parsedResult = parseFloat(result as string)
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
