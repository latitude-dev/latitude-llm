import { and, eq } from 'drizzle-orm'
import { publisher } from '../../events/publisher'
import { UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { issues } from '../../schema/models/issues'
import { Issue } from '../../schema/models/types/Issue'
import { User } from '../../schema/models/types/User'
import { ignoreIssueEvaluations } from './evaluations/ignoreIssueEvaluations'

export async function resolveIssue(
  {
    issue,
    user,
    ignoreEvaluations,
  }: {
    issue: Issue
    user: User
    ignoreEvaluations: boolean
  },
  transaction = new Transaction(),
) {
  if (issue.ignoredAt) {
    return Result.error(
      new UnprocessableEntityError('Cannot resolve an ignored issue'),
    )
  }

  if (issue.resolvedAt) {
    return Result.error(
      new UnprocessableEntityError('Issue is already resolved'),
    )
  }

  const resolvedAt = new Date()

  return await transaction.call(
    async (tx) => {
      const resolvedIssue = (await tx
        .update(issues)
        .set({
          resolvedAt: resolvedAt,
          updatedAt: resolvedAt,
        })
        .where(
          and(
            eq(issues.workspaceId, issue.workspaceId),
            eq(issues.uuid, issue.uuid),
          ),
        )
        .returning()
        .then((r) => r[0]!)) as Issue

      if (ignoreEvaluations) {
        await ignoreIssueEvaluations({ issue }, tx)
      }

      return Result.ok({ issue: resolvedIssue })
    },
    async ({ issue: resolvedIssue }) => {
      await publisher.publishLater({
        type: 'issueResolved',
        data: {
          workspaceId: resolvedIssue.workspaceId,
          issueId: resolvedIssue.id,
          userEmail: user.email,
        },
      })
    },
  )
}
