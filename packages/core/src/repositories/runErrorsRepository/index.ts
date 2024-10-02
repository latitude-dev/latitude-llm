import { and, eq, getTableColumns, isNotNull, or } from 'drizzle-orm'

import { ErrorableEntity, RunError } from '../../browser'
import { runErrors } from '../../schema'
import { DocumentLogsRepository } from '../documentLogsRepository'
import { EvaluationResultsRepository } from '../evaluationResultsRepository'
import Repository from '../repository'

const tt = getTableColumns(runErrors)

export class RunErrorsRepository extends Repository<typeof tt, RunError> {
  get scope() {
    const documentLogsScope = new DocumentLogsRepository(
      this.workspaceId,
      this.db,
    ).scope
    const evaluationResultsScope = new EvaluationResultsRepository(
      this.workspaceId,
      this.db,
    ).scope
    return this.db
      .select(tt)
      .from(runErrors)
      .leftJoin(
        documentLogsScope,
        and(
          eq(runErrors.errorableType, ErrorableEntity.DocumentLog),
          eq(runErrors.errorableId, documentLogsScope.id),
        ),
      )
      .leftJoin(
        evaluationResultsScope,
        and(
          eq(runErrors.errorableType, ErrorableEntity.EvaluationResult),
          eq(runErrors.errorableId, evaluationResultsScope.id),
        ),
      )
      .where(
        or(
          isNotNull(documentLogsScope.id),
          isNotNull(evaluationResultsScope.id),
        ),
      )
      .as('runErrorsScope')
  }
}
