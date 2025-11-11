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

export async function ignoreIssue(
  {
    issue,
    user,
  }: {
    issue: Issue
    user: User
  },
  transaction = new Transaction(),
) {
  if (issue.resolvedAt) {
    return Result.error(
      new UnprocessableEntityError('Cannot ignore a resolved issue'),
    )
  }

  if (issue.ignoredAt) {
    return Result.error(
      new UnprocessableEntityError('Issue is already ignored'),
    )
  }

  const ignoredAt = new Date()

  return await transaction.call(
    async (tx) => {
      // Update the issue to set ignoredAt
      const ignoredIssue = (await tx
        .update(issues)
        .set({
          ignoredAt: ignoredAt,
          updatedAt: ignoredAt,
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
      // If it does AND evaluateLiveLogs is true, set it to false
      for (const evaluation of allEvaluations) {
        // Cast to the expected type
        const evalV2 = {
          ...evaluation,
          uuid: evaluation.evaluationUuid,
          versionId: evaluation.id,
        }

        // Get the metric specification to check if it supports live evaluation
        const metricSpec = getEvaluationMetricSpecification(evalV2)

        // Only update if this metric supports live evaluation AND evaluateLiveLogs is currently true
        if (metricSpec.supportsLiveEvaluation && evaluation.evaluateLiveLogs) {
          await tx
            .update(evaluationVersions)
            .set({
              evaluateLiveLogs: false,
              updatedAt: new Date(),
            })
            .where(eq(evaluationVersions.id, evaluation.id))
        }
      }

      return Result.ok({ issue: ignoredIssue })
    },
    async ({ issue: ignoredIssue }) => {
      await publisher.publishLater({
        type: 'issueIgnored',
        data: {
          workspaceId: ignoredIssue.workspaceId,
          issueId: ignoredIssue.id,
          userEmail: user.email,
        },
      })
    },
  )
}
