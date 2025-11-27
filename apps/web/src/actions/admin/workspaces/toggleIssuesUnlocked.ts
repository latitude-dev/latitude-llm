'use server'

import { unsafelyFindWorkspace } from '@latitude-data/core/data-access/workspaces'
import { toggleIssuesUnlocked } from '@latitude-data/core/services/workspaces/toggleIssuesUnlocked'
import { z } from 'zod'

import { withAdmin } from '../../procedures'

export const toggleIssuesUnlockedAction = withAdmin
  .inputSchema(
    z.object({
      workspaceId: z.number(),
      enabled: z.boolean(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { workspaceId, enabled } = parsedInput

    const workspace = await unsafelyFindWorkspace(workspaceId)
    if (!workspace) {
      throw new Error('Workspace not found')
    }

    const result = await toggleIssuesUnlocked({
      workspace,
      enabled,
      currentUserEmail: ctx.user?.email || null,
      source: 'admin-action',
    })
    return result.unwrap()
  })
