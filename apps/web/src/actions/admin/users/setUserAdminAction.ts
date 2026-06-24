'use server'

import { z } from 'zod'

import { withAdmin } from '../../procedures'
import { setUserAdmin } from '@latitude-data/core/services/users/setAdmin'
import { unsafelyFindUserByEmail } from '@latitude-data/core/queries/users/findByEmail'
import { NotFoundError } from '@latitude-data/constants/errors'

export const setUserAdminAction = withAdmin
  .inputSchema(
    z.object({
      userEmail: z.string(),
      admin: z.boolean(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const user = await unsafelyFindUserByEmail({
      email: parsedInput.userEmail,
    })

    if (!user) {
      throw new NotFoundError(
        `Not found user with email: ${parsedInput.userEmail}`,
      )
    }

    return setUserAdmin(user, parsedInput.admin).then((r) => r.unwrap())
  })
