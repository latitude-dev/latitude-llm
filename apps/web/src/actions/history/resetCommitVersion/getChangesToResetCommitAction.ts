'use server'

import { z } from 'zod'

import { withProject } from '../../procedures'
import { getChangesToResetProjectToCommit } from '@latitude-data/core'

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
