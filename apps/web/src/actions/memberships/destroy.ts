'use server'

import { MembershipsRepository } from '@latitude-data/core/repositories'
import { destroyMembership } from '@latitude-data/core/services/memberships/destroy'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const destroyMembershipAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      id: z.string(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { id } = input
    const { user } = ctx
    if (user.id === id) {
      throw new Error('You cannot remove yourself from the workspace.')
    }

    const membershipsScope = new MembershipsRepository(ctx.workspace.id)
    const membership = await membershipsScope.findByUserId(id).then((r) => r.unwrap())

    return await destroyMembership(membership).then((r) => r.unwrap())
  })
