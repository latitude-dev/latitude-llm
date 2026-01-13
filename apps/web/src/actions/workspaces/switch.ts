'use server'

import { WorkspacesRepository } from '@latitude-data/core/repositories'
import { unsafelyGetUser } from '@latitude-data/core/data-access/users'
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
    const user = await unsafelyGetUser(userId)
    if (!user) {
      throw new Error('User not found')
    }

    await removeSession({ session: ctx.session as Session })
    await setSession(
      {
        sessionData: {
          user: { id: user.id, email: user.email },
          workspace,
        },
      },
      await cookies(),
    )

    if (parsedInput.redirectTo) {
      return redirect(parsedInput.redirectTo)
    }

    return workspace
  })
