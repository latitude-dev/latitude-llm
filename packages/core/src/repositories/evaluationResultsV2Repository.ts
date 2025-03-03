import { desc, eq, getTableColumns } from 'drizzle-orm'
import { EvaluationResultV2 } from '../browser'
import { evaluationResultsV2 } from '../schema'
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
}
