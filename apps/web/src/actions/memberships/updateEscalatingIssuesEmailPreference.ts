'use server'

import { MembershipsRepository } from '@latitude-data/core/repositories'
import { updateEscalatingIssuesEmailPreference } from '@latitude-data/core/services/memberships/updateEscalatingIssuesEmailPreference'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const updateEscalatingIssuesEmailPreferenceAction = authProcedure
  .inputSchema(z.object({ wantToReceive: z.boolean() }))
  .action(
    async ({ parsedInput: { wantToReceive }, ctx: { workspace, user } }) => {
      const membershipsScope = new MembershipsRepository(workspace.id)
      const membership = await membershipsScope
        .findByUserId(user.id)
        .then((r) => r.unwrap())

      return await updateEscalatingIssuesEmailPreference({
        membership,
        wantToReceive,
        userEmail: user.email,
      }).then((r) => r.unwrap())
    },
  )
