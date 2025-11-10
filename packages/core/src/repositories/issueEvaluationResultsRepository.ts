import { eq, getTableColumns } from 'drizzle-orm'
import { issueEvaluationResults } from '../schema/models/issueEvaluationResults'
import { IssueEvaluationResult } from '../schema/models/types/IssueEvaluationResult'
import Repository from './repositoryV2'

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

  async findByEvaluationResultId(
    evaluationResultId: number,
  ): Promise<IssueEvaluationResult | undefined> {
    const result = await this.db
      .select(tt)
      .from(issueEvaluationResults)
      .where(eq(issueEvaluationResults.evaluationResultId, evaluationResultId))
      .limit(1)

    return result[0] as IssueEvaluationResult | undefined
  }

  async findAllByEvaluationResultId(
    evaluationResultId: number,
  ): Promise<IssueEvaluationResult[]> {
    const results = await this.db
      .select(tt)
      .from(issueEvaluationResults)
      .where(eq(issueEvaluationResults.evaluationResultId, evaluationResultId))

    return results as IssueEvaluationResult[]
  }

  async findByIssueId(issueId: number): Promise<IssueEvaluationResult[]> {
    const results = await this.db
      .select(tt)
      .from(issueEvaluationResults)
      .where(eq(issueEvaluationResults.issueId, issueId))

    return results as IssueEvaluationResult[]
  }

  async existsForEvaluationResult(evaluationResultId: number): Promise<boolean> {
    const result = await this.db
      .select(tt)
      .from(issueEvaluationResults)
      .where(eq(issueEvaluationResults.evaluationResultId, evaluationResultId))
      .limit(1)

    return result.length > 0
  }
}
