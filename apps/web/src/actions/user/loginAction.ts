'use server'

import { getFirstWorkspace, getUserFromCredentials } from '$/data-access'
import { ROUTES } from '$/services/routes'
import { createMagicLinkToken } from '@latitude-data/core/services/magicLinkTokens/create'
import { z } from 'zod'

import { setSession } from '$/services/auth/setSession'
import { isLatitudeUrl } from '@latitude-data/constants'
import { NotFoundError } from '@latitude-data/constants/errors'
import { env } from '@latitude-data/env'
import { errorHandlingProcedure } from '../procedures'
import { frontendRedirect } from '$/lib/frontendRedirect'

export const loginAction = errorHandlingProcedure
  .inputSchema(
    z.object({
      email: z.email(),
      returnTo: z.string().optional(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const { user } = await getUserFromCredentials(parsedInput).then((r) =>
      r.unwrap(),
    )

    if (env.DISABLE_EMAIL_AUTHENTICATION) {
      if (!user) throw new NotFoundError('User not found')

      const workspace = await getFirstWorkspace({ userId: user.id }).then((r) =>
        r.unwrap(),
      )
      await setSession({
        sessionData: {
          user: {
            id: user.id,
            email: user.email,
          },
          workspace,
        },
      })

      if (!parsedInput.returnTo || !isLatitudeUrl(parsedInput.returnTo)) {
        return frontendRedirect(ROUTES.dashboard.root)
      }

      return frontendRedirect(parsedInput.returnTo)
    } else {
      await createMagicLinkToken({ user, returnTo: parsedInput.returnTo }).then(
        (r) => r.unwrap(),
      )
      return frontendRedirect(ROUTES.auth.magicLinkSent(user.email))
    }
  })
