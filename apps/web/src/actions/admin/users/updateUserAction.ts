'use server'

import { z } from 'zod'

import { withAdmin } from '../../procedures'
import { updateUser } from '@latitude-data/core/services/users/update'
import { unsafelyFindUserByEmail } from '@latitude-data/core/queries/users/findByEmail'
import { NotFoundError } from '@latitude-data/constants/errors'

export const updateUserAction = withAdmin
  .inputSchema(
    z.object({
      userEmail: z.string(),
      email: z.string(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const user = await unsafelyFindUserByEmail({
      email: parsedInput.userEmail,
    })

    if (!user) {
      throw new NotFoundError(`Not found user with email: ${parsedInput.email}`)
    }

    return updateUser(user, {
      email: parsedInput.email,
    }).then((r) => r.unwrap())
  })
