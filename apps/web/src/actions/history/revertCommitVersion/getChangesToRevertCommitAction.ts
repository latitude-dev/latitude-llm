'use server'

import { z } from 'zod'

import { withProject, withProjectSchema } from '../../procedures'

import { getChangesToRevertCommit } from '@latitude-data/core/services/history/revertCommit'

export const getChangesToRevertCommitAction = withProject
  .inputSchema(
    withProjectSchema.extend({
      commitUuid: z.string(),
      targetDraftUuid: z.string().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { workspace, project } = ctx
    const { targetDraftUuid, commitUuid } = parsedInput

    const changes = await getChangesToRevertCommit({
      workspace,
      project,
      targetDraftUuid,
      commitUuid,
    }).then((r) => r.unwrap())

    return changes
  })
