'use server'

import { getFirstWorkspace, getUserFromCredentials } from '$/data-access'
import { ROUTES } from '$/services/routes'
import { createMagicLinkToken } from '@latitude-data/core/services/magicLinkTokens/create'
import { z } from 'zod'

import { setSession } from '$/services/auth/setSession'
import { isLatitudeUrl } from '@latitude-data/constants'
import { NotFoundError } from '@latitude-data/constants/errors'
import { env } from '@latitude-data/env'
import { errorHandlingProcedure, withRateLimit } from '../procedures'
import { frontendRedirect } from '$/lib/frontendRedirect'

/**
 * Logs a user in by email.
 *
 * The response never reveals whether an account exists for the given email:
 * with magic links enabled, unknown emails land on the same "magic link sent"
 * page as known ones; with email authentication disabled, a generic error is
 * returned.
 */
export const loginAction = errorHandlingProcedure
  .use(withRateLimit({ limit: 10, period: 60 }))
  .inputSchema(
    z.object({
      email: z.email(),
      returnTo: z.string().optional(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const result = await getUserFromCredentials(parsedInput)
    if (result.error && !(result.error instanceof NotFoundError)) {
      throw result.error
    }

    const user = result.value?.user

    if (env.DISABLE_EMAIL_AUTHENTICATION) {
      if (!user) throw new NotFoundError('Invalid email')

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
    }

    if (user) {
      await createMagicLinkToken({ user, returnTo: parsedInput.returnTo }).then(
        (r) => r.unwrap(),
      )
    }

    return frontendRedirect(ROUTES.auth.magicLinkSent(parsedInput.email))
  })
