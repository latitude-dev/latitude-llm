'use server'

import { getUserFromCredentials } from '$/data-access'
import { setSession } from '$/services/auth/setSession'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerAction } from 'zsa'

export const loginAction = createServerAction()
  .input(
    z.object({
      email: z.string().email(),
      password: z.string().min(3),
    }),
    { type: 'formData' },
  )
  .handler(async ({ input }) => {
    const result = await getUserFromCredentials(input)
    const sessionData = result.unwrap()

    setSession({ sessionData })
    redirect(ROUTES.root)
  })
