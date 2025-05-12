'use server'

import { inviteUser } from '@latitude-data/core/services/users/invite'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const inviteUserAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      email: z.string(),
      name: z.string(),
    }),
  )
  .handler(async ({ input, ctx }) =>
    inviteUser({
      email: input.email,
      name: input.name,
      workspace: ctx.workspace,
      author: ctx.user,
    }).then((r) => r.unwrap()),
  )
