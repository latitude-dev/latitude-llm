import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { issueEvaluationResults } from '../../schema/models/issueEvaluationResults'
import { publisher } from '../../events/publisher'

/**
 * Bulk links evaluation results to a single issue.
 * Useful for merging issues where multiple evaluation results need to be associated
 * with the winning issue. Uses ON CONFLICT DO NOTHING to handle duplicates gracefully.
 */
export async function bulkLinkIssueEvaluationResults(
  {
    workspaceId,
    issueId,
    evaluationResultIds,
    timestamp,
  }: {
    workspaceId: number
    issueId: number
    evaluationResultIds: number[]
    timestamp: Date
  },
  transaction = new Transaction(),
) {
  if (evaluationResultIds.length === 0) return Result.nil()

  return await transaction.call(
    async (tx) => {
      await tx
        .insert(issueEvaluationResults)
        .values(
          evaluationResultIds.map((evaluationResultId) => ({
            workspaceId,
            issueId: issueId,
            evaluationResultId,
            createdAt: timestamp,
            updatedAt: timestamp,
          })),
        )
        .onConflictDoNothing()

      return Result.ok({ issueId, evaluationResultIds })
    },
    async ({ issueId, evaluationResultIds }) => {
      await Promise.all(
        evaluationResultIds.map((evaluationResultId) =>
          publisher.publishLater({
            type: 'issueEvaluationResultLinked',
            data: {
              workspaceId,
              issueId,
              evaluationResultId,
            },
          }),
        ),
      )
    },
  )
}
