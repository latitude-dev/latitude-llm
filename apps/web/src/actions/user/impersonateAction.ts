'use server'

import { getFirstWorkspace, getUserFromCredentials } from '$/data-access'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { authProcedure } from '../procedures'
import { ForbiddenError } from '@latitude-data/constants/errors'
import { setSession } from '$/services/auth/setSession'

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
        user: userToImpersonate,
        workspace: workspaceToImpersonate,
      },
    })

    redirect(ROUTES.root)
  })
