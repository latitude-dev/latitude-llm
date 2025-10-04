'use server'

import { deleteDocumentTrigger } from '@latitude-data/core/services/documentTriggers/delete'

import { withCommit } from '$/actions/procedures'
import { z } from 'zod'

export const deleteDocumentTriggerAction = withCommit
  .createServerAction()
  .input(
    z.object({
      documentTriggerUuid: z.string(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { documentTriggerUuid } = input
    const { workspace, commit } = ctx

    return deleteDocumentTrigger({
      workspace,
      commit,
      triggerUuid: documentTriggerUuid,
    }).then((r) => r.unwrap())
  })
