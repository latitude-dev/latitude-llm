'use server'

import { setSession } from '$/services/auth/setSession'
import { ROUTES } from '$/services/routes'
import setupService from '$/services/user/setupService'
import { isLatitudeUrl } from '@latitude-data/constants'
import { unsafelyFindUserByEmail } from '@latitude-data/core/data-access'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { errorHandlingProcedure } from '../procedures'

export const setupAction = errorHandlingProcedure
  .createServerAction()
  .input(
    async () => {
      return z.object({
        returnTo: z.string().optional(),
        source: z.string().optional(),
        name: z.string().min(1, { message: 'Name is a required field' }),
        email: z
          .string()
          .email()
          .refine(
            async (email) => {
              const existingUser = await unsafelyFindUserByEmail(email)
              return !existingUser
            },
            { message: 'Email is already in use' },
          )
          .refine(
            async (email) =>
              !email.match(/^[A-Z0-9_!#$%&'*+/=?`{|}~^.-]+@[A-Z0-9.-]+$/) &&
              !email.match(/^[^+]+\+\d+@[A-Z0-9.-]+$/i),
            { message: 'Email is not valid' },
          ),
        companyName: z
          .string()
          .min(1, { message: 'Workspace name is a required field' }),
      })
    },
    { type: 'formData' },
  )
  .handler(async ({ input }) => {
    const result = await setupService(input)
    const { workspace, user } = result.unwrap()

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
