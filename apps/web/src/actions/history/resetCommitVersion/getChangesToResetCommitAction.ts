'use server'

import { z } from 'zod'

import { withProject, withProjectSchema } from '../../procedures'
import { getChangesToResetProjectToCommit } from '@latitude-data/core/services/history/resetProjectToCommit'

export const getChangesToResetCommitAction = withProject
  .inputSchema(
    withProjectSchema.extend({
      targetDraftUuid: z.string().optional(),
      commitUuid: z.string(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { workspace, project } = ctx
    const { targetDraftUuid, commitUuid } = parsedInput

    const changes = await getChangesToResetProjectToCommit({
      workspace,
      project,
      targetDraftUuid,
      commitUuid,
    }).then((r) => r.unwrap())

    return changes
  })
