'use server'

import { getUserFromCredentials } from '$/data-access'
import db from '$/db/database'
import { setSession } from '$/lib/auth/setSession'
import { ROUTES } from '$/lib/routes'
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
    const result = await getUserFromCredentials(input, { db })
    const sessionData = result.unwrap()

    setSession({ sessionData })
    redirect(ROUTES.root)
  })
