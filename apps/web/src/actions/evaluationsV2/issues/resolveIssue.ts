'use server'

import { IssuesRepository } from '@latitude-data/core/repositories'
import { resolveIssue } from '@latitude-data/core/services/issues/resolve'
import { z } from 'zod'
import { withCommit, withCommitSchema } from '../../procedures'

export const resolveIssueAction = withCommit
  .inputSchema(
    withCommitSchema.extend({
      issueId: z.number(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const issue = await new IssuesRepository(ctx.workspace.id)
      .find(parsedInput.issueId)
      .then((r) => r.unwrap())

    const response = await resolveIssue({
      issue,
      user: ctx.user,
    }).then((r) => r.unwrap())

    return response.issue
  })
