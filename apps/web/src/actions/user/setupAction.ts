'use server'

import { UsersRepository } from '@latitude-data/core/repositories'
import { createMagicLinkToken } from '@latitude-data/core/services/magicLinkTokens/create'
import { ROUTES } from '$/services/routes'
import setupService from '$/services/user/setupService'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { errorHandlingProcedure } from '../procedures'

export const setupAction = errorHandlingProcedure
  .createServerAction()
  .input(
    async () => {
      return z.object({
        name: z.string().min(1, { message: 'Name is a required field' }),
        email: z
          .string()
          .email()
          .refine(
            async (email) => {
              const existingUser = await UsersRepository.findByEmail(email)
              return !existingUser
            },
            { message: 'Email is already in use' },
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
    const { user } = result.unwrap()
    await createMagicLinkToken({ user: user }).then((r) => r.unwrap())

    redirect(ROUTES.auth.magicLinkSent(user.email))
  })
