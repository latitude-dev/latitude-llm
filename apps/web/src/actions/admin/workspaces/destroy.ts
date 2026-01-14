'use server'

import { unsafelyFindWorkspace } from '@latitude-data/core/data-access/workspaces'
import { destroyWorkspace } from '@latitude-data/core/services/workspaces/destroy'
import { z } from 'zod'

import { withAdmin } from '../../procedures'

export const destroyWorkspaceAction = withAdmin
  .inputSchema(
    z.object({
      workspaceId: z.number(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const { workspaceId } = parsedInput

    const workspace = await unsafelyFindWorkspace(workspaceId)
    if (!workspace) {
      throw new Error('Workspace not found')
    }

    const result = await destroyWorkspace(workspace)
    return result.unwrap()
  })
