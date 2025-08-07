import { claimNewUserReferrals } from '../../services/claimedRewards'
import type { ClaimReferralInvitationEvent } from '../events'

export const createClaimInvitationReferralJob = ({
  data: event,
}: {
  data: ClaimReferralInvitationEvent
}) => {
  return claimNewUserReferrals({ email: event.data.newUser.email })
}
