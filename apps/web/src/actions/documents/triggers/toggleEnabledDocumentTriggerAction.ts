'use server'

import { setDocumentTriggerEnabled } from '@latitude-data/core/services/documentTriggers/enable'

import { withCommit } from '../../procedures'
import { z } from 'zod'

export const toggleEnabledDocumentTriggerAction = withCommit
  .inputSchema(z.object({ triggerUuid: z.string(), enabled: z.boolean() }))
  .action(async ({ parsedInput, ctx }) => {
    const { triggerUuid, enabled } = parsedInput
    const { workspace, commit } = ctx

    return setDocumentTriggerEnabled({
      workspace,
      commit,
      triggerUuid,
      enabled,
    }).then((r) => r.unwrap())
  })
