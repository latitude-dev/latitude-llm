import { and, eq } from 'drizzle-orm'
import { publisher } from '../../events/publisher'
import { UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { issues } from '../../schema/models/issues'
import { Issue } from '../../schema/models/types/Issue'
import { User } from '../../schema/models/types/User'
import { ignoreIssueEvaluations } from './evaluations/ignoreIssueEvaluations'

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

      await ignoreIssueEvaluations({ issue }, tx)

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
