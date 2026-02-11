'use server'

import { WorkspacesRepository } from '@latitude-data/core/repositories'
import { unsafelyFindUserById } from '@latitude-data/core/queries/users/findById'
import { z } from 'zod'
import { setSession } from '$/services/auth/setSession'
import { authProcedure } from '../procedures'
import { cookies } from 'next/headers'
import { removeSession, Session } from '$/services/auth/removeSession'
import { redirect } from 'next/navigation'

export const switchWorkspaceAction = authProcedure
  .inputSchema(
    z.object({
      workspaceId: z.number(),
      redirectTo: z.string().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const userId = ctx.session.userId
    const workspacesScope = new WorkspacesRepository(userId)

    // Verify the user has access to this workspace
    const workspace = await workspacesScope
      .find(parsedInput.workspaceId)
      .then((r) => r.unwrap())

    // Get the current user
    const user = await unsafelyFindUserById({ id: userId })
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

    if (parsedInput.redirectTo) {
      return redirect(parsedInput.redirectTo)
    }

    return workspace
  })
