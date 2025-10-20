import { type InferSelectModel } from 'drizzle-orm'

import { claimedRewards } from '../claimedRewards'

export type ClaimedReward = InferSelectModel<typeof claimedRewards>
export type ClaimedRewardWithUserInfo = ClaimedReward & {
  workspaceName: string | null
  userName: string | null
  userEmail: string | null
}
