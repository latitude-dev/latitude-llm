'use server'

import { z } from 'zod'
import { setSession } from '$/services/auth/setSession'
import { ROUTES } from '$/services/routes'
import setupService from '$/services/user/setupService'
import { isCloneActionUrl } from '@latitude-data/constants'
import { unsafelyFindUserByEmail } from '@latitude-data/core/data-access/users'

import { errorHandlingProcedure } from '../procedures'
import { frontendRedirect } from '$/lib/frontendRedirect'
import { UserTitle } from '@latitude-data/constants/users'

export const setupAction = errorHandlingProcedure
  .inputSchema(
    z.object({
      returnTo: z.string().optional(),
      source: z.string().optional(),
      name: z.string().min(1, { error: 'Name is a required field' }),
      email: z
        .string()
        .pipe(z.email())
        .refine(
          async (email) => {
            const existingUser = await unsafelyFindUserByEmail(email)
            return !existingUser
          },
          { error: 'Email is already in use' },
        )
        .refine(
          async (email) =>
            !email.match(/^[A-Z0-9_!#$%&'*+/=?`{|}~^.-]+@[A-Z0-9.-]+$/) &&
            !email.match(/^[^+]+\+\d+@[A-Z0-9.-]+$/i),
          { error: 'Email is not valid' },
        ),
      companyName: z
        .string()
        .min(1, { error: 'Workspace name is a required field' }),
      title: z.enum(UserTitle).optional(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const result = await setupService(parsedInput)
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

    // If there is no returnTo or its NOT a clone action url, redirect to onboarding
    // Add reset=true to ensure new users start from the beginning
    if (!parsedInput.returnTo || !isCloneActionUrl(parsedInput.returnTo)) {
      return frontendRedirect(`${ROUTES.onboarding.root}?reset=true`)
    }

    return frontendRedirect(parsedInput.returnTo)
  })
