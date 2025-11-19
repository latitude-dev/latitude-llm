'use server'

import { IssuesRepository } from '@latitude-data/core/repositories'
import { ignoreIssue } from '@latitude-data/core/services/issues/ignore'
import { z } from 'zod'
import { withCommit, withCommitSchema } from '$/actions/procedures'

export const ignoreIssueAction = withCommit
  .inputSchema(
    withCommitSchema.extend({
      issueId: z.number(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const issue = await new IssuesRepository(ctx.workspace.id)
      .find(parsedInput.issueId)
      .then((r) => r.unwrap())

    const response = await ignoreIssue({
      issue,
      user: ctx.user,
    }).then((r) => r.unwrap())

    return response.issue
  })
