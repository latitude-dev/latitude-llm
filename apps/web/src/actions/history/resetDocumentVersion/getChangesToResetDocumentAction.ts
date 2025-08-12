'use server'

import { z } from 'zod'

import { withProject, withProjectSchema } from '../../procedures'
import { getChangesToResetDocumentToVersion } from '@latitude-data/core/services/history/resetDocumentToVersion'

export const getChangesToResetDocumentAction = withProject
  .inputSchema(
    withProjectSchema.extend({
      targetDraftUuid: z.string().optional(),
      documentCommitUuid: z.string(),
      documentUuid: z.string(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { workspace, project } = ctx
    const { targetDraftUuid, documentCommitUuid, documentUuid } = parsedInput

    const change = await getChangesToResetDocumentToVersion({
      workspace,
      project,
      targetDraftUuid,
      documentCommitUuid,
      documentUuid,
    }).then((r) => r.unwrap())

    return [change]
  })
