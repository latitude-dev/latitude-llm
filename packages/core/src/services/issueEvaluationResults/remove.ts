import { and, eq } from 'drizzle-orm'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { issueEvaluationResults } from '../../schema/models/issueEvaluationResults'
import { Issue } from '../../schema/models/types/Issue'
import { EvaluationResultV2 } from '@latitude-data/constants'
import { publisher } from '../../events/publisher'

/**
 * Removes a relation between an issue and an evaluation result.
 */
export async function removeIssueEvaluationResult(
  {
    issue,
    evaluationResult,
    workspaceId,
  }: {
    issue: Issue
    evaluationResult: EvaluationResultV2
    workspaceId: number
  },
  transaction = new Transaction(),
) {
  return await transaction.call(
    async (tx) => {
      await tx
        .delete(issueEvaluationResults)
        .where(
          and(
            eq(issueEvaluationResults.workspaceId, workspaceId),
            eq(issueEvaluationResults.issueId, issue.id),
            eq(issueEvaluationResults.evaluationResultId, evaluationResult.id),
          ),
        )

      return Result.ok({ issue, evaluationResult })
    },
    async ({ issue, evaluationResult }) => {
      await publisher.publishLater({
        type: 'issueEvaluationResultUnlinked',
        data: {
          workspaceId,
          issueId: issue.id,
          evaluationResultId: evaluationResult.id,
        },
      })
    },
  )
}
