'use server'
import { updateRewardClaim } from '@latitude-data/core/services/claimedRewards/update'
import { z } from 'zod'
import { withAdmin } from '../procedures'
import { ClaimedReward } from '@latitude-data/core/schema/types'

export const updateRewardClaimValidityAction = withAdmin
  .inputSchema(
    z.object({
      claimId: z.number(),
      isValid: z.boolean().nullable(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const result = await updateRewardClaim({
      claimId: parsedInput.claimId,
      isValid: parsedInput.isValid,
    })

    return result.unwrap() as ClaimedReward | undefined
  })
