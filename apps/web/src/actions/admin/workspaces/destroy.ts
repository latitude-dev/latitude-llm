'use server'

import { unsafelyFindWorkspace } from '@latitude-data/core/data-access/workspaces'
import { enqueueDestroyWorkspaceJob } from '@latitude-data/core/jobs/definitions'
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

    await enqueueDestroyWorkspaceJob(workspaceId)

    return { workspaceId, name: workspace.name }
  })
