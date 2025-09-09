import { ClaimRewardModal } from './ClaimRewardModal'

export default function PromocodesLayout() {
  // const isClaimed = useMemo(() => {
  //     if (!claimedRewardData) return false

  //     if (type === RewardType.Referral) {
  //       return claimedRewardData?.isValid === true
  //     }

  //     return claimedRewardData?.isValid !== false
  //   }, [claimedRewardData, type])

  // const buttonDisabled = useMemo(() => {
  //     if (isClaimed) return true

  //     if (config.buttonConfig?.allowMultiple) {
  //       return claimedReferences.includes(reference)
  //     }

  //     return !!claimedRewardData
  //   }, [
  //     claimedReferences,
  //     claimedRewardData,
  //     config.buttonConfig?.allowMultiple,
  //     reference,
  //     isClaimed,
  //   ])

  return (
    <div className='flex flex-row w-full items-start gap-2'>
      <ClaimRewardModal />
    </div>
  )
}
