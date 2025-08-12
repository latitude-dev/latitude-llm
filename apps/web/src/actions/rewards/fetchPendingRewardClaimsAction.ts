'use server'

import { findAllRewardClaimsPendingToValidate } from '@latitude-data/core/data-access'
import { withAdmin } from '../procedures'

export const fetchPendingRewardClaimsAction = withAdmin.action(async () => {
  const result = await findAllRewardClaimsPendingToValidate()
  return result.unwrap()
})
