'use server'

import { z } from 'zod'

import { withProject } from '../../procedures'
import { resetProjectToCommit } from '@latitude-data/core/services/history/resetProjectToCommit'

export const resetCommitVersionAction = withProject
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

    const draft = await resetProjectToCommit({
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
