'use server'

import { findIssue } from '@latitude-data/core/queries/issues/findById'
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
    const issue = await findIssue({
      workspaceId: ctx.workspace.id,
      id: parsedInput.issueId,
    })

    const response = await ignoreIssue({
      issue,
      user: ctx.user,
    }).then((r) => r.unwrap())

    return response.issue
  })
