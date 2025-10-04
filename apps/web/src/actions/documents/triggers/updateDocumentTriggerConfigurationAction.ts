'use server'

import { updateDocumentTriggerConfiguration } from '@latitude-data/core/services/documentTriggers/update'

import { documentTriggerConfigurationSchema } from '@latitude-data/constants/documentTriggers'
import { z } from 'zod'
import { withCommit } from '$/actions/procedures'

export const updateDocumentTriggerConfigurationAction = withCommit
  .createServerAction()
  .input(
    z.object({
      documentTriggerUuid: z.string(),
      documentUuid: z.string().optional(),
      configuration: documentTriggerConfigurationSchema,
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { documentTriggerUuid, configuration } = input
    const { workspace, commit } = ctx

    return updateDocumentTriggerConfiguration({
      workspace,
      commit,
      triggerUuid: documentTriggerUuid,
      documentUuid: input.documentUuid,
      configuration,
    }).then((r) => r.unwrap())
  })
