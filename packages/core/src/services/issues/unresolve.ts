import { and, eq } from 'drizzle-orm'
import { publisher } from '../../events/publisher'
import { UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { issues } from '../../schema/models/issues'
import { Issue } from '../../schema/models/types/Issue'
import { User } from '../../schema/models/types/User'
import { unignoreIssueEvaluations } from './evaluations/unignoreIssueEvaluations'

export async function unresolveIssue(
  {
    issue,
    user,
  }: {
    issue: Issue
    user: User
  },
  transaction = new Transaction(),
) {
  if (issue.mergedAt) {
    return Result.error(
      new UnprocessableEntityError('Cannot unresolve a merged issue'),
    )
  }

  if (issue.ignoredAt) {
    return Result.error(
      new UnprocessableEntityError('Cannot unresolve an ignored issue'),
    )
  }

  if (!issue.resolvedAt) {
    return Result.error(new UnprocessableEntityError('Issue is not resolved'))
  }

  const now = new Date()

  return await transaction.call(
    async (tx) => {
      const unresolvedIssue = (await tx
        .update(issues)
        .set({
          resolvedAt: null,
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

      return Result.ok({ issue: unresolvedIssue })
    },
    async ({ issue: unresolvedIssue }) => {
      await publisher.publishLater({
        type: 'issueUnresolved',
        data: {
          workspaceId: unresolvedIssue.workspaceId,
          issueId: unresolvedIssue.id,
          userEmail: user.email,
        },
      })
    },
  )
}
