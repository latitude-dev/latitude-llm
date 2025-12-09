'use server'

import { unsafelyFindWorkspace } from '@latitude-data/core/data-access/workspaces'
import { toggleBigAccount } from '@latitude-data/core/services/workspaces/toggleBigAccount'
import { z } from 'zod'

import { withAdmin } from '../../procedures'

export const toggleBigAccountAction = withAdmin
  .inputSchema(
    z.object({
      workspaceId: z.number(),
      enabled: z.boolean(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const { workspaceId, enabled } = parsedInput

    const workspace = await unsafelyFindWorkspace(workspaceId)
    if (!workspace) {
      throw new Error('Workspace not found')
    }

    const result = await toggleBigAccount({
      workspace,
      enabled,
    })
    return result.unwrap()
  })
