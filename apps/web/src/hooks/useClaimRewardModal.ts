import { useCallback, useMemo } from 'react'
import { useToggleModal } from './useToogleModal'
import { RewardType } from '@latitude-data/core/constants'

type UseClaimRewardModalProps = {
  rewardType: RewardType
  title?: string
  description?: string
  placeholder?: string
  claimLabel?: string
  successMessage?: string
}

export function useClaimRewardModal({
  rewardType,
  title,
  description,
  placeholder,
  claimLabel,
  successMessage,
}: UseClaimRewardModalProps) {
  const modal = useToggleModal()

  const modalProps = useMemo(
    () => ({
      isOpen: modal.open,
      onOpenChange: modal.onOpenChange,
      rewardType,
      title,
      description,
      placeholder,
      claimLabel,
      successMessage,
    }),
    [
      modal.open,
      modal.onOpenChange,
      rewardType,
      title,
      description,
      placeholder,
      claimLabel,
      successMessage,
    ],
  )

  const openModal = useCallback(() => {
    modal.onOpen()
  }, [modal])

  const closeModal = useCallback(() => {
    modal.onClose()
  }, [modal])

  return {
    ...modal,
    modalProps,
    openModal,
    closeModal,
  }
}
