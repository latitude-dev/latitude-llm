'use server'

import { getFirstWorkspace, getUserFromCredentials } from '$/data-access'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { setSession } from '$/services/auth/setSession'
import { ForbiddenError } from '@latitude-data/constants/errors'
import { authProcedure } from '../procedures'

export const impersonateAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      email: z.string().email(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { user } = ctx
    if (!user.admin) throw new ForbiddenError('You are not an admin')

    const { user: userToImpersonate } = await getUserFromCredentials(
      input,
    ).then((r) => r.unwrap())
    const workspaceToImpersonate = await getFirstWorkspace({
      userId: user.id,
    }).then((r) => r.unwrap())

    await setSession({
      sessionData: {
        impersonating: true,
        user: {
          id: userToImpersonate.id,
          email: userToImpersonate.email,
        },
        workspace: workspaceToImpersonate,
      },
    })

    redirect(ROUTES.root)
  })
