'use server'

import { z } from 'zod'
import { withProject } from '../../procedures'
import { revertChangesToDocument } from '@latitude-data/core/services/history/revertDocumentVersion'

export const revertDocumentChangesAction = withProject
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
