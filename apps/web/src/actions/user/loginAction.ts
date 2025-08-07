'use server'

import { getFirstWorkspace, getUserFromCredentials } from '$/data-access'
import { ROUTES } from '$/services/routes'
import { createMagicLinkToken } from '@latitude-data/core/services/magicLinkTokens/create'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { setSession } from '$/services/auth/setSession'
import { isLatitudeUrl } from '@latitude-data/constants'
import { NotFoundError } from '@latitude-data/constants/errors'
import { env } from '@latitude-data/env'
import { errorHandlingProcedure } from '../procedures'

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

      const workspace = await getFirstWorkspace({ userId: user.id }).then((r) => r.unwrap())
      await setSession({
        sessionData: {
          user: {
            id: user.id,
            email: user.email,
          },
          workspace,
        },
      })

      if (!input.returnTo || !isLatitudeUrl(input.returnTo)) {
        return redirect(ROUTES.dashboard.root)
      }

      return redirect(input.returnTo)
    } else {
      await createMagicLinkToken({ user, returnTo: input.returnTo }).then((r) => r.unwrap())

      redirect(ROUTES.auth.magicLinkSent(user.email))
    }
  })
