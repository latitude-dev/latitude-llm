'use server'

import { IssuesRepository } from '@latitude-data/core/repositories'
import { unignoreIssue } from '@latitude-data/core/services/issues/unignore'
import { z } from 'zod'
import { withCommit, withCommitSchema } from '../../procedures'

export const unignoreIssueAction = withCommit
  .inputSchema(
    withCommitSchema.extend({
      issueId: z.number(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const issue = await new IssuesRepository(ctx.workspace.id)
      .find(parsedInput.issueId)
      .then((r) => r.unwrap())

    const response = await unignoreIssue({
      issue,
      user: ctx.user,
    }).then((r) => r.unwrap())

    return response.issue
  })
