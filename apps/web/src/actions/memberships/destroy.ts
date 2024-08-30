'use server'

import { MembershipsRepository } from '@latitude-data/core/repositories'
import { destroyMembership } from '@latitude-data/core/services/memberships/destroy'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const destroyMembershipAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      userId: z.string(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { userId } = input
    const membershipsScope = new MembershipsRepository(ctx.workspace.id)
    const membership = await membershipsScope
      .findByUserId(userId)
      .then((r) => r.unwrap())

    return await destroyMembership(membership).then((r) => r.unwrap())
  })
