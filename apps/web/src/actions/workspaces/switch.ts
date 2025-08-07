'use server'

import { removeSession, Session } from '$/services/auth/removeSession'
import { setSession } from '$/services/auth/setSession'
import { unsafelyGetUser } from '@latitude-data/core/data-access'
import { WorkspacesRepository } from '@latitude-data/core/repositories'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { authProcedure } from '../procedures'

export const switchWorkspaceAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      workspaceId: z.number(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const userId = ctx.session.userId
    const workspacesScope = new WorkspacesRepository(userId)

    // Verify the user has access to this workspace
    const workspace = await workspacesScope
      .find(input.workspaceId)
      .then((r) => r.unwrap())

    // Get the current user
    const user = await unsafelyGetUser(userId)
    if (!user) {
      throw new Error('User not found')
    }

    await removeSession({ session: ctx.session as Session })
    await setSession(
      {
        sessionData: { workspace, user },
      },
      await cookies(),
    )

    return workspace
  })
