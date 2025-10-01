'use server'

import { ClaimedReward } from '@latitude-data/core/browser'
import { updateRewardClaim } from '@latitude-data/core/services/claimedRewards/update'
import { z } from 'zod'
import { withAdmin } from '../procedures'

export const updateRewardClaimValidityAction = withAdmin
  .createServerAction()
  .input(
    z.object({
      claimId: z.number(),
      isValid: z.boolean().nullable(),
    }),
  )
  .handler(async ({ input }) => {
    const result = await updateRewardClaim({
      claimId: input.claimId,
      isValid: input.isValid,
    })

    return result.unwrap() as ClaimedReward | undefined
  })
