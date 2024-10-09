import { and, eq, sql } from 'drizzle-orm'

import { ErrorableEntity, EvaluationResultableType } from '../../../browser'
import {
  evaluationResultableBooleans,
  evaluationResultableNumbers,
  evaluationResultableTexts,
  evaluationResults,
  evaluations,
  runErrors,
} from '../../../schema'
import { evaluationResultDto } from '../../evaluationResultsRepository'
import Repository from '../../repository'

export const ERROR_SELECT = {
  code: sql<string>`${runErrors.code}`.as('error_code'),
  message: sql<string>`${runErrors.message}`.as('error_message'),
  details: sql<string>`${runErrors.details}`.as('error_details'),
}

const evaluationResultDtoWithErrors = {
  ...evaluationResultDto,
  error: ERROR_SELECT,
}

type EvaluationResultDtoWithErrors = typeof evaluationResultDtoWithErrors

export class EvaluationResultsWithErrorsRepository extends Repository<
  typeof evaluationResultDtoWithErrors,
  EvaluationResultDtoWithErrors
> {
  get scope() {
    return this.db
      .select(evaluationResultDtoWithErrors)
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
      .where(eq(evaluations.workspaceId, this.workspaceId))
      .as('evaluationResultsWithErrorsScope')
  }
}
