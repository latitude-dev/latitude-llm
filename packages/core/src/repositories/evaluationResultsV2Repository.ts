import { and, count, desc, eq, getTableColumns, gte, isNull } from 'drizzle-orm'
import { ErrorableEntity, EvaluationResultV2 } from '../browser'
import { Result } from '../lib'
import { evaluationResultsV2, runErrors } from '../schema'
import Repository from './repositoryV2'

const tt = getTableColumns(evaluationResultsV2)

export class EvaluationResultsV2Repository extends Repository<EvaluationResultV2> {
  get scopeFilter() {
    return eq(evaluationResultsV2.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(tt)
      .from(evaluationResultsV2)
      .where(this.scopeFilter)
      .orderBy(desc(evaluationResultsV2.createdAt))
      .$dynamic()
  }

  async countSinceDate(since: Date) {
    const result = await this.db
      .select({ count: count() })
      .from(evaluationResultsV2)
      .leftJoin(
        runErrors,
        and(
          eq(runErrors.errorableUuid, evaluationResultsV2.uuid),
          eq(runErrors.errorableType, ErrorableEntity.EvaluationResult),
        ),
      )
      .where(
        and(
          this.scopeFilter,
          isNull(runErrors.id),
          gte(evaluationResultsV2.createdAt, since),
        ),
      )
      .then((r) => r[0]!)

    return Result.ok<number>(result.count)
  }
}
