'use client'

import Notifications from '$/components/Notifications'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { CloseTrigger } from '@latitude-data/web-ui/atoms/Modal'
import { useRouter } from 'next/navigation'

export default function NotificationsModal() {
  const router = useRouter()

  return (
    <Modal
      dismissible
      open
      onOpenChange={(open) => {
        if (!open) {
          router.back()
        }
      }}
      title='Email Notifications'
      description='Manage your email notification preferences.'
      footer={
        <>
          <CloseTrigger />
        </>
      }
    >
      <Notifications />
    </Modal>
  )
}
