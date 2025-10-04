'use server'

import { z } from 'zod'

import { withProject } from '../../procedures'
import { resetDocumentToVersion } from '@latitude-data/core/services/history/resetDocumentToVersion'

export const resetDocumentVersionAction = withProject
  .createServerAction()
  .input(
    z.object({
      targetDraftUuid: z.string().optional(),
      documentCommitUuid: z.string(),
      documentUuid: z.string(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { user, workspace, project } = ctx
    const { targetDraftUuid, documentCommitUuid, documentUuid } = input

    const result = await resetDocumentToVersion({
      user,
      workspace,
      project,
      targetDraftUuid,
      documentCommitUuid,
      documentUuid,
    }).then((r) => r.unwrap())

    return {
      commitUuid: result.commit.uuid,
      documentUuid: result.documentUuid,
    }
  })
