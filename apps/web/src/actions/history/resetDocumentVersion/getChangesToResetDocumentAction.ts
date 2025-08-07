'use server'

import { z } from 'zod'

import { getChangesToResetDocumentToVersion } from '@latitude-data/core/services/history/resetDocumentToVersion'
import { withProject } from '../../procedures'

export const getChangesToResetDocumentAction = withProject
  .createServerAction()
  .input(
    z.object({
      targetDraftUuid: z.string().optional(),
      documentCommitUuid: z.string(),
      documentUuid: z.string(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { workspace, project } = ctx
    const { targetDraftUuid, documentCommitUuid, documentUuid } = input

    const change = await getChangesToResetDocumentToVersion({
      workspace,
      project,
      targetDraftUuid,
      documentCommitUuid,
      documentUuid,
    }).then((r) => r.unwrap())

    return [change]
  })
