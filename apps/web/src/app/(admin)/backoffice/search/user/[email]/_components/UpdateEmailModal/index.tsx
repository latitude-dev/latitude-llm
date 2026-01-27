'use client'

import { FormEvent, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { CloseTrigger, Modal } from '@latitude-data/web-ui/atoms/Modal'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { updateUserAction } from '$/actions/admin/users/updateUserAction'
import { ROUTES, BackofficeRoutes } from '$/services/routes'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentEmail: string
}

export function UpdateEmailModal({ open, onOpenChange, currentEmail }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [newEmail, setNewEmail] = useState('')

  const { execute, isPending } = useLatitudeAction(updateUserAction, {
    onSuccess: ({ data }) => {
      toast({
        title: 'Email Updated',
        description: `User email updated to ${data.email}`,
      })
      onOpenChange(false)
      router.push(ROUTES.backoffice[BackofficeRoutes.search].user(data.email))
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update email',
        variant: 'destructive',
      })
    },
  })

  useEffect(() => {
    if (open) {
      setNewEmail('')
    }
  }, [open])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!newEmail.trim() || newEmail === currentEmail) return

    await execute({ userEmail: currentEmail, email: newEmail.trim() })
  }

  return (
    <Modal
      dismissible
      open={open}
      onOpenChange={onOpenChange}
      title='Update User Email'
      description='Change the email address for this user. The user will need to use the new email to log in.'
      footer={
        <>
          <CloseTrigger />
          <Button
            fancy
            form='updateEmailForm'
            type='submit'
            disabled={
              isPending || !newEmail.trim() || newEmail === currentEmail
            }
            isLoading={isPending}
          >
            Update Email
          </Button>
        </>
      }
    >
      <form id='updateEmailForm' onSubmit={handleSubmit}>
        <FormWrapper>
          <Input
            label='New Email Address'
            name='email'
            type='email'
            placeholder='Enter new email address'
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
            description={`Current email: ${currentEmail}`}
          />
        </FormWrapper>
      </form>
    </Modal>
  )
}
