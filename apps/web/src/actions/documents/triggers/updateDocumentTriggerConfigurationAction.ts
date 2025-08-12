'use server'

import { updateDocumentTriggerConfiguration } from '@latitude-data/core/services/documentTriggers/update'

import { documentTriggerConfigurationSchema } from '@latitude-data/constants/documentTriggers'
import { z } from 'zod'
import { withCommit, withCommitSchema } from '$/actions/procedures'

export const updateDocumentTriggerConfigurationAction = withCommit
  .inputSchema(
    withCommitSchema.extend({
      documentTriggerUuid: z.string(),
      documentUuid: z.string().optional(),
      configuration: documentTriggerConfigurationSchema,
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { documentTriggerUuid, configuration } = parsedInput
    const { workspace, commit } = ctx

    return updateDocumentTriggerConfiguration({
      workspace,
      commit,
      triggerUuid: documentTriggerUuid,
      documentUuid: parsedInput.documentUuid,
      configuration,
    }).then((r) => r.unwrap())
  })
