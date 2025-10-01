'use server'

import { WorkspacesRepository } from '@latitude-data/core/repositories'
import { updateWorkspace } from '@latitude-data/core/services/workspaces/update'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const updateWorkspaceAction = authProcedure
  .inputSchema(
    z.object({
      workspaceId: z.number(),
      name: z.string(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const userId = ctx.session.userId
    const workspacesScope = new WorkspacesRepository(userId)
    const workspace = await workspacesScope
      .find(parsedInput.workspaceId)
      .then((r) => r.unwrap())

    const updatedWorkspace = await updateWorkspace(workspace, {
      name: parsedInput.name,
    }).then((r) => r.unwrap())

    return updatedWorkspace
  })
