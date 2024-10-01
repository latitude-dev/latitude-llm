'use server'

import { ClaimedRewardsRepository } from '@latitude-data/core/repositories'

import { authProcedure } from '../procedures'

export const fetchClaimedRewardsAction = authProcedure
  .createServerAction()
  .handler(async ({ ctx }) => {
    const claimedRewardsScope = new ClaimedRewardsRepository(ctx.workspace.id)
    const result = await claimedRewardsScope.findAllValidOptimistic()
    return result.unwrap()
  })
