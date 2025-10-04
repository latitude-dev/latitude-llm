'use server'

import { getUserFromCredentials } from '$/data-access'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { setSession } from '$/services/auth/setSession'
import { withAdmin } from '../../procedures'

export const impersonateAction = withAdmin
  .createServerAction()
  .input(
    z.object({
      email: z.string().email(),
    }),
  )
  .handler(async ({ input }) => {
    const { user, workspace } = await getUserFromCredentials(input).then((r) =>
      r.unwrap(),
    )
    await setSession({
      sessionData: {
        impersonating: true,
        user,
        workspace,
      },
    })

    redirect(ROUTES.root)
  })
