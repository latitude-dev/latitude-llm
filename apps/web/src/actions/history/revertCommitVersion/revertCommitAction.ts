'use server'

import { z } from 'zod'

import { withProject } from '../../procedures'
import { revertCommit } from '@latitude-data/core/services/history/revertCommit'

export const revertCommitChangesAction = withProject
  .inputSchema(
    z.object({
      targetDraftUuid: z.string().optional(),
      commitUuid: z.string(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { user, workspace, project } = ctx
    const { targetDraftUuid, commitUuid } = parsedInput

    const draft = await revertCommit({
      workspace,
      user,
      project,
      targetDraftUuid,
      commitUuid,
    }).then((r) => r.unwrap())

    return {
      commitUuid: draft.uuid,
    }
  })
