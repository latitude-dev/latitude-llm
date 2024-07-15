'use server'

import { isWorkspaceCreated } from '$/data-access'
import db from '$/db/database'
import { setSession } from '$/lib/auth/setSession'
import { ROUTES } from '$/lib/routes'
import setupService from '$/services/user/setupService'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerAction } from 'zsa'

export const setupAction = createServerAction()
  .input(
    z.object({
      name: z.string().min(1, { message: 'Name is a required field' }),
      email: z.string().email(),
      password: z
        .string()
        .min(8, { message: 'Password must be at least 8 characters' }),
      companyName: z
        .string()
        .min(1, { message: 'Workspace name is a required field' }),
    }),
    { type: 'formData' },
  )
  .handler(async ({ input }) => {
    const itWasAlreadySetup = await isWorkspaceCreated({ db })

    if (itWasAlreadySetup) {
      throw new Error('Workspace already created')
    }

    const result = await setupService(input)
    const sessionData = result.unwrap()

    setSession({ sessionData })
    redirect(ROUTES.root)
  })
