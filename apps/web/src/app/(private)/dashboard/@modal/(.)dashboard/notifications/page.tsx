'use client'

import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { CloseTrigger } from '@latitude-data/web-ui/atoms/Modal'
import { useRouter } from 'next/navigation'

import Notifications from '../../../../settings/_components/Notifications'

export default function DashboardNotificationsModal() {
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
          <CloseTrigger>Close</CloseTrigger>
        </>
      }
    >
      <Notifications />
    </Modal>
  )
}
