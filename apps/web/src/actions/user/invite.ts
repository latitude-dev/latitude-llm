'use server'

import { inviteUser } from '@latitude-data/core/services/users/invite'
import { z } from 'zod'
import { applyUserPlanLimit } from '@latitude-data/core/services/subscriptions/limits/applyUserPlanLimit'
import { authProcedure } from '../procedures'
import { INVITATIONS_DISABLED } from '$/lib/constants'
import { containsUrl } from '@latitude-data/core/lib/containsUrl'

export const inviteUserAction = authProcedure
  .inputSchema(
    z.object({
      email: z.email(),
      name: z
        .string()
        .max(200, { error: 'Name is too long' })
        .refine((name) => !containsUrl(name), {
          error: 'Name must not contain URLs',
        }),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    if (INVITATIONS_DISABLED) {
      throw new Error('Workspace invitations are temporarily disabled')
    }

    await applyUserPlanLimit({ workspace: ctx.workspace }).then((r) =>
      r.unwrap(),
    )

    return await inviteUser({
      email: parsedInput.email,
      name: parsedInput.name,
      workspace: ctx.workspace,
      author: ctx.user,
    }).then((r) => r.unwrap())
  })
