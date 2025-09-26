'use server'

import { deleteDocumentTrigger } from '@latitude-data/core/services/documentTriggers/delete'

import { withCommit, withCommitSchema } from '$/actions/procedures'
import { z } from 'zod'

export const deleteDocumentTriggerAction = withCommit
  .inputSchema(withCommitSchema.extend({ documentTriggerUuid: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    const { documentTriggerUuid } = parsedInput
    const { workspace, commit } = ctx

    return deleteDocumentTrigger({
      workspace,
      commit,
      triggerUuid: documentTriggerUuid,
    }).then((r) => r.unwrap())
  })
