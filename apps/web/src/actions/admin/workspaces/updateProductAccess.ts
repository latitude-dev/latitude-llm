'use server'

import { unsafelyFindWorkspace } from '@latitude-data/core/data-access/workspaces'
import { updateProductAccess } from '@latitude-data/core/services/workspaces/updateProductAccess'
import { z } from 'zod'

import { withAdmin } from '../../procedures'

export const updateProductAccessAction = withAdmin
  .inputSchema(
    z.object({
      workspaceId: z.number(),
      promptManagerEnabled: z.boolean().optional(),
      agentBuilderEnabled: z.boolean().optional(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const { workspaceId, promptManagerEnabled, agentBuilderEnabled } =
      parsedInput

    const workspace = await unsafelyFindWorkspace(workspaceId)
    if (!workspace) {
      throw new Error('Workspace not found')
    }

    const result = await updateProductAccess({
      workspace,
      promptManagerEnabled,
      agentBuilderEnabled,
    })
    return result.unwrap()
  })
