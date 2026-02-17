'use server'

import { updateWorkspace } from '@latitude-data/core/services/workspaces/update'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const updateWorkspaceAction = authProcedure
  .inputSchema(
    z.object({
      name: z.string(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const updatedWorkspace = await updateWorkspace(ctx.workspace, {
      name: parsedInput.name,
    }).then((r) => r.unwrap())

    return updatedWorkspace
  })
