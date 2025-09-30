'use server'

import { z } from 'zod'

import { withProject } from '../../procedures'

import { getChangesToRevertCommit } from '@latitude-data/core/services/history/revertCommit'

export const getChangesToRevertCommitAction = withProject
  .createServerAction()
  .input(
    z.object({
      commitUuid: z.string(),
      targetDraftUuid: z.string().optional(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { workspace, project } = ctx
    const { targetDraftUuid, commitUuid } = input

    const changes = await getChangesToRevertCommit({
      workspace,
      project,
      targetDraftUuid,
      commitUuid,
    }).then((r) => r.unwrap())

    return changes
  })
