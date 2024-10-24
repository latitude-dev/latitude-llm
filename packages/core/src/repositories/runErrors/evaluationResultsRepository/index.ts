import { and, eq, isNull, sql } from 'drizzle-orm'

import { ErrorableEntity, EvaluationResultableType } from '../../../browser'
import {
  evaluationResultableBooleans,
  evaluationResultableNumbers,
  evaluationResultableTexts,
  evaluationResults,
  evaluations,
  runErrors,
} from '../../../schema'
import {
  evaluationResultDto,
  EvaluationResultWithMetadata,
} from '../../evaluationResultsRepository'
import RepositoryLegacy from '../../repository'

const evaluationResultDtoWithErrors = {
  ...evaluationResultDto,
  error: {
    code: sql<string>`${runErrors.code}`.as('evaluation_result_error_code'),
    message: sql<string>`${runErrors.message}`.as(
      'evaluation_result_error_message',
    ),
    details: sql<string>`${runErrors.details}`.as(
      'evaluation_result_error_details',
    ),
  },
}

export type RunErrorField = {
  code: string | null
  message: string | null
  details: string | null
}
export type EvaluationResultWithMetadataAndErrors =
  EvaluationResultWithMetadata & {
    error: RunErrorField
  }

export class EvaluationResultsWithErrorsRepository extends RepositoryLegacy<
  typeof evaluationResultDtoWithErrors,
  EvaluationResultWithMetadataAndErrors
> {
  get scope() {
    return this.db
      .select(evaluationResultDtoWithErrors)
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
      .where(eq(evaluations.workspaceId, this.workspaceId))
      .as('evaluationResultsWithErrorsScope')
  }
}
