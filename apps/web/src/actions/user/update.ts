'use server'

import { updateUser } from '@latitude-data/core/services/users/update'
import { z } from 'zod'
import { authProcedure } from '../procedures'

export const updateUserAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      devMode: z.boolean(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const result = await updateUser(ctx.user, {
      devMode: input.devMode,
    }).then((r) => r.unwrap())

    return result
  })
