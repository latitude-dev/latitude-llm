'use server'

import { z } from 'zod'

import { getChangesToResetProjectToCommit } from '@latitude-data/core/services/history/resetProjectToCommit'
import { withProject } from '../../procedures'

export const getChangesToResetCommitAction = withProject
  .createServerAction()
  .input(
    z.object({
      targetDraftUuid: z.string().optional(),
      commitUuid: z.string(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { workspace, project } = ctx
    const { targetDraftUuid, commitUuid } = input

    const changes = await getChangesToResetProjectToCommit({
      workspace,
      project,
      targetDraftUuid,
      commitUuid,
    }).then((r) => r.unwrap())

    return changes
  })
