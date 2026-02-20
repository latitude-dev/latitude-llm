import { EvaluationResultV2 } from '@latitude-data/constants'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { issueEvaluationResults } from '../../schema/models/issueEvaluationResults'
import { Issue } from '../../schema/models/types/Issue'
import { publisher } from '../../events/publisher'

/**
 * Adds a relation between an issue and an evaluation result.
 * Uses ON CONFLICT DO NOTHING to handle duplicate relations gracefully.
 */
export async function addIssueEvaluationResult(
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
        .insert(issueEvaluationResults)
        .values({
          workspaceId,
          issueId: issue.id,
          evaluationResultId: evaluationResult.id,
        })
        .onConflictDoNothing()

      return Result.ok({ issue, evaluationResult })
    },
    async ({ issue, evaluationResult }) => {
      await publisher.publishLater({
        type: 'issueEvaluationResultLinked',
        data: {
          workspaceId,
          issueId: issue.id,
          evaluationResultId: evaluationResult.id,
        },
      })
    },
  )
}
