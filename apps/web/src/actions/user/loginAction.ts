'use server'

import { createMagicLinkToken } from '@latitude-data/core/services/magicLinkTokens/create'
import { getUserFromCredentials } from '$/data-access'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'
import { z } from 'zod'

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
    await createMagicLinkToken({ user, returnTo: input.returnTo }).then((r) =>
      r.unwrap(),
    )

    redirect(ROUTES.auth.magicLinkSent(user.email))
  })
