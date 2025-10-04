'use server'

import { z } from 'zod'

import { withProject } from '../../procedures'
import { revertCommit } from '@latitude-data/core/services/history/revertCommit'

export const revertCommitChangesAction = withProject
  .createServerAction()
  .input(
    z.object({
      targetDraftUuid: z.string().optional(),
      commitUuid: z.string(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { user, workspace, project } = ctx
    const { targetDraftUuid, commitUuid } = input

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
