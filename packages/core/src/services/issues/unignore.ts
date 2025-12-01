import { and, eq } from 'drizzle-orm'
import { publisher } from '../../events/publisher'
import { UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { issues } from '../../schema/models/issues'
import { Issue } from '../../schema/models/types/Issue'
import { User } from '../../schema/models/types/User'
import { unignoreIssueEvaluations } from './evaluations/unignoreIssueEvaluations'

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

      await unignoreIssueEvaluations({ issue }, tx)

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
