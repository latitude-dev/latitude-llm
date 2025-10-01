'use server'

import { z } from 'zod'
import { withProject, withProjectSchema } from '../../procedures'
import { revertChangesToDocument } from '@latitude-data/core/services/history/revertDocumentVersion'

export const revertDocumentChangesAction = withProject
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

    const result = await revertChangesToDocument({
      workspace,
      project,
      user,
      targetDraftUuid,
      documentCommitUuid,
      documentUuid,
    }).then((r) => r.unwrap())

    return {
      commitUuid: result.commit.uuid,
      documentUuid: result.documentUuid,
    }
  })
