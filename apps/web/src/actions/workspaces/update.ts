'use server'

import { WorkspacesRepository } from '@latitude-data/core/repositories'
import { updateWorkspace } from '@latitude-data/core/services/workspaces/update'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const updateWorkspaceAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      workspaceId: z.number(),
      name: z.string(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const userId = ctx.session.userId
    const workspacesScope = new WorkspacesRepository(userId)
    const workspace = await workspacesScope.find(input.workspaceId).then((r) => r.unwrap())

    const updatedWorkspace = await updateWorkspace(workspace, {
      name: input.name,
    }).then((r) => r.unwrap())

    return updatedWorkspace
  })
