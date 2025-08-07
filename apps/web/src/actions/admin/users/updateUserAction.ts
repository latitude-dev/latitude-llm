'use server'

import { z } from 'zod'

import { NotFoundError } from '@latitude-data/constants/errors'
import { unsafelyGetUserByEmail } from '@latitude-data/core/data-access'
import { updateUser } from '@latitude-data/core/services/users/update'
import { withAdmin } from '../../procedures'

export const updateUserAction = withAdmin
  .createServerAction()
  .input(
    z.object({
      userEmail: z.string(),
      email: z.string(),
    }),
  )
  .handler(async ({ input }) => {
    const user = await unsafelyGetUserByEmail(input.userEmail)

    if (!user) {
      throw new NotFoundError(`Not found user with email: ${input.email}`)
    }

    return updateUser(user, {
      email: input.email,
    }).then((r) => r.unwrap())
  })
