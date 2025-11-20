import { eq, getTableColumns, and, isNull, desc } from 'drizzle-orm'
import { issueEvaluationResults } from '../schema/models/issueEvaluationResults'
import { IssueEvaluationResult } from '../schema/models/types/IssueEvaluationResult'
import Repository from './repositoryV2'
import { EvaluationResultV2 } from '@latitude-data/constants'
import { issues } from '../schema/models/issues'

const tt = getTableColumns(issueEvaluationResults)

export class IssueEvaluationResultsRepository extends Repository<IssueEvaluationResult> {
  get scopeFilter() {
    return eq(issueEvaluationResults.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(tt)
      .from(issueEvaluationResults)
      .where(this.scopeFilter)
      .$dynamic()
  }

  /**
   * Issues <-> EvaluationResults association table
   * An evaluation result can be assigned to multiple issues over time
   * For example when an issue is merged into another issue, the evaluation results
   * are reassigned to the target issue. But also remain assigned to the source issue
   * for historical purposes.
   *
   * When we work with evaluation results we only care about the last active assignment.
   * Merged issues are considered inactive.
   *
   * Find the last not merged issue assigned to a given EvaluationResult
   * Also is loaded by creation of the association in descending order
   */
  async findLastActiveAssignedIssue({
    result,
  }: {
    result: EvaluationResultV2
  }) {
    const findResult = await this.db
      .select(tt)
      .from(issueEvaluationResults)
      .innerJoin(issues, eq(issueEvaluationResults.issueId, issues.id))
      .where(
        and(
          this.scopeFilter,
          eq(issueEvaluationResults.evaluationResultId, result.id),
          eq(isNull(issues.mergedAt), true),
        ),
      )
      .orderBy(desc(issueEvaluationResults.createdAt))
      .limit(1)

    return findResult[0]
  }
}
