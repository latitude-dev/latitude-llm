'use server'

import { updateUser } from '@latitude-data/core/services/users/update'
import { UserTitle } from '@latitude-data/constants/users'
import { z } from 'zod'
import { authProcedure } from '../procedures'

export const updateUserTitleAction = authProcedure
  .inputSchema(
    z.object({
      title: z.nativeEnum(UserTitle),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const result = await updateUser(ctx.user, {
      title: parsedInput.title,
    }).then((r) => r.unwrap())

    return result
  })
