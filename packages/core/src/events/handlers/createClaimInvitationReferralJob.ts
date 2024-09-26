import { ClaimReferralInvitationEvent } from '.'
import { claimNewUserReferrals } from '../../services/claimedRewards'

export const createClaimInvitationReferralJob = ({
  data: event,
}: {
  data: ClaimReferralInvitationEvent
}) => {
  return claimNewUserReferrals({ email: event.data.newUser.email })
}
