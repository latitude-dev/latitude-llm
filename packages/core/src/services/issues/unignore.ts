import { and, eq } from 'drizzle-orm'
import { publisher } from '../../events/publisher'
import { UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import { issues } from '../../schema/models/issues'
import { Issue } from '../../schema/models/types/Issue'
import { User } from '../../schema/models/types/User'
import { getEvaluationMetricSpecification } from '../evaluationsV2/specifications'

export async function unignoreIssue(
  {
    issue,
    user,
  }: {
    issue: Issue
    user: User
  },
  transaction = new Transaction(),
) {
  // Check if the issue is resolved
  if (issue.resolvedAt) {
    return Result.error(
      new UnprocessableEntityError('Cannot unignore a resolved issue'),
    )
  }

  // Check if the issue is not ignored
  if (!issue.ignoredAt) {
    return Result.error(new UnprocessableEntityError('Issue is not ignored'))
  }

  const now = new Date()

  return await transaction.call(
    async (tx) => {
      // Update the issue to set ignoredAt to null
      const unignoredIssue = (await tx
        .update(issues)
        .set({
          ignoredAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(issues.workspaceId, issue.workspaceId),
            eq(issues.uuid, issue.uuid),
          ),
        )
        .returning()
        .then((r) => r[0]!)) as Issue

      // Find all evaluations that have this issueId
      const allEvaluations = await tx
        .select()
        .from(evaluationVersions)
        .where(
          and(
            eq(evaluationVersions.workspaceId, issue.workspaceId),
            eq(evaluationVersions.issueId, issue.id),
          ),
        )

      // For each evaluation, check if it supports live evaluation
      // If it does AND evaluateLiveLogs is false, set it back to true
      for (const evaluation of allEvaluations) {
        // Cast to the expected type
        const evalV2 = {
          ...evaluation,
          uuid: evaluation.evaluationUuid,
          versionId: evaluation.id,
        }

        // Get the metric specification to check if it supports live evaluation
        const metricSpec = getEvaluationMetricSpecification(evalV2)

        // Only update if this metric supports live evaluation AND evaluateLiveLogs is currently false
        if (metricSpec.supportsLiveEvaluation && !evaluation.evaluateLiveLogs) {
          await tx
            .update(evaluationVersions)
            .set({
              evaluateLiveLogs: true,
              updatedAt: new Date(),
            })
            .where(eq(evaluationVersions.id, evaluation.id))
        }
      }

      return Result.ok({ issue: unignoredIssue })
    },
    async ({ issue: unignoredIssue }) => {
      await publisher.publishLater({
        type: 'issueUnignored',
        data: {
          workspaceId: unignoredIssue.workspaceId,
          issueId: unignoredIssue.id,
          userEmail: user.email,
        },
      })
    },
  )
}
