'use server'

import { updateUser } from '@latitude-data/core/services/users/update'
import { z } from 'zod'
import { authProcedure } from '../procedures'

export const updateUserAction = authProcedure
  .inputSchema(
    z.object({
      devMode: z.boolean(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const result = await updateUser(ctx.user, {
      devMode: parsedInput.devMode,
    }).then((r) => r.unwrap())

    return result
  })
