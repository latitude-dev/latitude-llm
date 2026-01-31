'use client'

import Notifications from '$/components/Notifications'
import { useNavigate } from '$/hooks/useNavigate'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { CloseTrigger } from '@latitude-data/web-ui/atoms/Modal'

export default function NotificationsModal({ route }: { route?: string }) {
  const router = useNavigate()

  return (
    <Modal
      dismissible
      open
      onOpenChange={(open) => {
        if (!open) {
          if (route) {
            router.push(route)
          } else {
            router.back()
          }
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
