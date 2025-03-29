'use server'

import { findAllRewardClaimsPendingToValidate } from '@latitude-data/core'
import { UnauthorizedError } from '@latitude-data/core'

import { authProcedure } from '../procedures'

export const fetchPendingRewardClaimsAction = authProcedure
  .createServerAction()
  .handler(async ({ ctx }) => {
    if (!ctx.user.admin) {
      throw new UnauthorizedError('You must be an admin to see pending claims')
    }

    const result = await findAllRewardClaimsPendingToValidate()
    return result.unwrap()
  })
