'use server'

import { inviteUser } from '@latitude-data/core/services/users/invite'
import { z } from 'zod'
import { applyUserPlanLimit } from '@latitude-data/core/services/subscriptions/limits/applyUserPlanLimit'
import { authProcedure } from '../procedures'
import { INVITATIONS_DISABLED } from '$/lib/constants'

export const inviteUserAction = authProcedure
  .inputSchema(z.object({ email: z.email(), name: z.string() }))
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
