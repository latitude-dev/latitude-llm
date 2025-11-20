import { EvaluationResultV2 } from '@latitude-data/constants'
import { database } from '../../client'
import { issueEvaluationResults } from '../../schema/models/issueEvaluationResults'
import { type Issue } from '../../schema/models/types/Issue'
import { type IssueEvaluationResult } from '../../schema/models/types/IssueEvaluationResult'
import { type Workspace } from '../../schema/models/types/Workspace'

export async function createIssueEvaluationResult({
  workspace,
  issue,
  evaluationResult,
  createdAt,
}: {
  workspace: Workspace
  issue: Issue
  evaluationResult: EvaluationResultV2
  createdAt?: Date
}): Promise<IssueEvaluationResult> {
  const result = await database
    .insert(issueEvaluationResults)
    .values({
      workspaceId: workspace.id,
      issueId: issue.id,
      evaluationResultId: evaluationResult.id,
      createdAt: createdAt ?? new Date(),
    })
    .returning()

  return result[0] as IssueEvaluationResult
}
