'use server'

import { getFirstWorkspace } from '$/data-access'
import { setSession } from '$/services/auth/setSession'
import { ROUTES } from '$/services/routes'
import { isLatitudeUrl } from '@latitude-data/constants'
import { NotFoundError } from '@latitude-data/constants/errors'
import { unsafelyFindMagicLinkByToken, unsafelyGetUser } from '@latitude-data/core/data-access'
import { confirmMagicLinkToken } from '@latitude-data/core/services/magicLinkTokens/confirm'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerAction } from 'zsa'

export const confirmMagicLinkTokenAction = createServerAction()
  .input(
    z.object({
      token: z.string(),
      returnTo: z.string().optional(),
    }),
  )
  .handler(async ({ input }) => {
    const magicLinkToken = await unsafelyFindMagicLinkByToken(input.token).then((r) => r[0])
    if (!magicLinkToken || !!magicLinkToken.expiredAt) {
      if (!input.returnTo) {
        return redirect(ROUTES.auth.login)
      }

      redirect(`${ROUTES.auth.login}?returnTo=${encodeURIComponent(input.returnTo)}`)
    }

    const user = await unsafelyGetUser(magicLinkToken.userId)
    if (!user) throw new NotFoundError('User not found')

    await confirmMagicLinkToken(input.token).then((r) => r.unwrap())

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
  })
