'use server'

import { getFirstWorkspace } from '$/data-access'
import { setSession } from '$/services/auth/setSession'
import { ROUTES } from '$/services/routes'
import { isLatitudeUrl } from '@latitude-data/constants'
import { NotFoundError } from '@latitude-data/constants/errors'
import { unsafelyFindMagicLinkByToken } from '@latitude-data/core/data-access/magicLinkTokens'
import { unsafelyFindUserById } from '@latitude-data/core/queries/users/findById'
import { confirmMagicLinkToken } from '@latitude-data/core/services/magicLinkTokens/confirm'
import { z } from 'zod'
import { errorHandlingProcedure } from '../procedures'
import { frontendRedirect } from '$/lib/frontendRedirect'

export const confirmMagicLinkTokenAction = errorHandlingProcedure
  .inputSchema(
    z.object({
      token: z.string(),
      returnTo: z.string().optional(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const magicLinkToken = await unsafelyFindMagicLinkByToken(
      parsedInput.token,
    ).then((r) => r[0])
    if (!magicLinkToken || !!magicLinkToken.expiredAt) {
      if (!parsedInput.returnTo) {
        return frontendRedirect(ROUTES.auth.login)
      }

      return frontendRedirect(
        `${ROUTES.auth.login}?returnTo=${encodeURIComponent(parsedInput.returnTo)}`,
      )
    }

    const user = await unsafelyFindUserById({ id: magicLinkToken.userId })
    if (!user) throw new NotFoundError('User not found')

    await confirmMagicLinkToken(parsedInput.token).then((r) => r.unwrap())

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
  })
