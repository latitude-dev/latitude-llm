'use server'

import type { ClaimedReward } from '@latitude-data/core/browser'
import { UnauthorizedError } from '@latitude-data/constants/errors'
import { updateRewardClaim } from '@latitude-data/core/services/claimedRewards/update'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const updateRewardClaimValidityAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      claimId: z.number(),
      isValid: z.boolean().nullable(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    if (!ctx.user.admin) {
      throw new UnauthorizedError('You must be an admin to see pending claims')
    }

    const result = await updateRewardClaim({
      claimId: input.claimId,
      isValid: input.isValid,
    })
    return result.unwrap() as ClaimedReward | undefined
  })
