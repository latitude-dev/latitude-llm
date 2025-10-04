'use server'
import { claimReward } from '@latitude-data/core/services/claimedRewards/claim'
import { z } from 'zod'

import { authProcedure } from '../procedures'
import { ClaimedReward } from '@latitude-data/core/schema/types'
import { RewardType } from '@latitude-data/core/constants'

export const claimRewardAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      type: z.enum(Object.values(RewardType) as [string, ...string[]]),
      reference: z.string(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const workspace = ctx.workspace
    const user = ctx.user
    const result = await claimReward({
      workspace,
      user,
      type: input.type as RewardType,
      reference: input.reference,
    })
    return result.unwrap() as ClaimedReward | undefined
  })
