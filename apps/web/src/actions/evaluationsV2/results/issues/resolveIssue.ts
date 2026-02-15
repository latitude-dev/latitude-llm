'use server'

import { findIssue } from '@latitude-data/core/queries/issues/findById'
import { resolveIssue } from '@latitude-data/core/services/issues/resolve'
import { z } from 'zod'
import { withCommit, withCommitSchema } from '$/actions/procedures'

export const resolveIssueAction = withCommit
  .inputSchema(
    withCommitSchema.extend({
      issueId: z.number(),
      ignoreEvaluations: z.boolean(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const issue = await findIssue({
      workspaceId: ctx.workspace.id,
      id: parsedInput.issueId,
    })

    const response = await resolveIssue({
      issue,
      user: ctx.user,
      ignoreEvaluations: parsedInput.ignoreEvaluations,
    }).then((r) => r.unwrap())

    return response.issue
  })
