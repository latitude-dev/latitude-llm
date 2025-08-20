'use server'

import { setDocumentTriggerEnabled } from '@latitude-data/core/services/documentTriggers/enable'

import { withCommit } from '../../procedures'
import { z } from 'zod'

export const toggleEnabledDocumentTriggerAction = withCommit
  .createServerAction()
  .input(
    z.object({
      triggerUuid: z.string(),
      enabled: z.boolean(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { triggerUuid, enabled } = input
    const { workspace, commit } = ctx

    return setDocumentTriggerEnabled({
      workspace,
      commit,
      triggerUuid,
      enabled,
    }).then((r) => r.unwrap())
  })
