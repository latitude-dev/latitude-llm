'use client'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { impersonateAction } from '$/actions/admin/users/impersonateAction'
import { CloseTrigger, Modal } from '@latitude-data/web-ui/atoms/Modal'
import { useState } from 'react'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'

type Props = {
  userEmail: string
}

export function ImpersonateUserButton({ userEmail }: Props) {
  const { execute, isPending } = useLatitudeAction(impersonateAction)
  const [isOpen, setIsOpen] = useState(false)

  const handleImpersonate = async () => {
    await execute({ email: userEmail })
  }

  return (
    <>
      <Button
        fancy
        onClick={() => setIsOpen(true)}
        disabled={isPending}
        variant='destructive'
        size='small'
      >
        {isPending ? 'Impersonating...' : 'Impersonate User'}
      </Button>
      <Modal
        dismissible
        open={isOpen}
        size='large'
        onOpenChange={setIsOpen}
        title='Impersonate User'
        description='Impersonate the user and access the application as them.'
        footer={
          <div className='flex justify-end gap-2'>
            <CloseTrigger />
            <Button
              fancy
              onClick={handleImpersonate}
              disabled={isPending}
              variant='destructive'
              size='small'
            >
              Impersonate
            </Button>
          </div>
        }
      >
        <Alert
          variant='warning'
          description='This will allow you to access the application as them. Use ONLY for support purposes after acknowledgement from the user.'
        />
      </Modal>
    </>
  )
}
