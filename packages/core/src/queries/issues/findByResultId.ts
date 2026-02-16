import { NotFoundError } from '../../lib/errors'
import { type Issue } from '../../schema/models/types/Issue'
import { scopedQuery } from '../scope'
import { findLastActiveAssignedIssue } from '../issueEvaluationResults/findLastActiveAssignedIssue'
import { findIssueById } from './findById'

export const findIssueByResultId = scopedQuery(
  async function findIssueByResultId(
    {
      workspaceId,
      resultId,
    }: {
      workspaceId: number
      resultId: number
    },
    db,
  ): Promise<Issue> {
    const membership = await findLastActiveAssignedIssue(
      { workspaceId, resultId },
      db,
    )

    if (!membership) {
      throw new NotFoundError(
        `No active issue assignment found for resultId ${resultId}`,
      )
    }

    const issue = await findIssueById(
      { workspaceId, issueId: membership.issueId },
      db,
    )

    if (!issue) {
      throw new NotFoundError(`Issue with id ${membership.issueId} not found`)
    }

    return issue
  },
)
