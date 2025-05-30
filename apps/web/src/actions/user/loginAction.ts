'use server'

import { createMagicLinkToken } from '@latitude-data/core/services/magicLinkTokens/create'
import { getFirstWorkspace, getUserFromCredentials } from '$/data-access'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { errorHandlingProcedure } from '../procedures'
import { env } from '@latitude-data/env'
import { NotFoundError } from '@latitude-data/constants/errors'
import { setSession } from '$/services/auth/setSession'

export const loginAction = errorHandlingProcedure
  .createServerAction()
  .input(
    z.object({
      email: z.string().email(),
      returnTo: z.string().optional(),
    }),
    { type: 'formData' },
  )
  .handler(async ({ input }) => {
    const { user } = await getUserFromCredentials(input).then((r) => r.unwrap())

    if (env.DISABLE_EMAIL_AUTHENTICATION) {
      if (!user) throw new NotFoundError('User not found')

      const workspace = await getFirstWorkspace({ userId: user.id }).then((r) =>
        r.unwrap(),
      )
      await setSession({
        sessionData: {
          user,
          workspace,
        },
      })

      redirect(input.returnTo ? input.returnTo : ROUTES.root)
    } else {
      await createMagicLinkToken({ user, returnTo: input.returnTo }).then((r) =>
        r.unwrap(),
      )

      redirect(ROUTES.auth.magicLinkSent(user.email))
    }
  })
