'use server'

import { z } from 'zod'

import { withProject, withProjectSchema } from '../../procedures'
import { resetDocumentToVersion } from '@latitude-data/core/services/history/resetDocumentToVersion'

export const resetDocumentVersionAction = withProject
  .inputSchema(
    withProjectSchema.extend({
      targetDraftUuid: z.string().optional(),
      documentCommitUuid: z.string(),
      documentUuid: z.string(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { user, workspace, project } = ctx
    const { targetDraftUuid, documentCommitUuid, documentUuid } = parsedInput

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
