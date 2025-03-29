'use server'

import { unsafelyGetUser } from '@latitude-data/core'
import { NotFoundError } from '@latitude-data/core'
import { confirmMagicLinkToken } from '@latitude-data/core'
import { getFirstWorkspace } from '$/data-access'
import { setSession } from '$/services/auth/setSession'
import { ROUTES } from '$/services/routes'
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
    const magicLinkToken = await confirmMagicLinkToken(input.token).then((r) =>
      r.unwrap(),
    )

    const user = await unsafelyGetUser(magicLinkToken.userId)
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
  })
