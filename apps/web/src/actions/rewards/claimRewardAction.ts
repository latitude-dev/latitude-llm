'use server'

import { ClaimedReward, RewardType } from '@latitude-data/core/browser'
import { claimReward } from '@latitude-data/core/services/claimedRewards/claim'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const claimRewardAction = authProcedure
  .inputSchema(
    z.object({
      type: z.enum(Object.values(RewardType) as [string, ...string[]]),
      reference: z.string(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const workspace = ctx.workspace
    const user = ctx.user
    const result = await claimReward({
      workspace,
      user,
      type: parsedInput.type as RewardType,
      reference: parsedInput.reference,
    })
    return result.unwrap() as ClaimedReward | undefined
  })
