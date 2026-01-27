'use client'

import { FormEvent, useState } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { CloseTrigger, Modal } from '@latitude-data/web-ui/atoms/Modal'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { enqueueWeeklyEmailAction } from '$/actions/admin/weeklyEmail/enqueueWeeklyEmail'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: number
}

export function WeeklyEmailModal({ open, onOpenChange, workspaceId }: Props) {
  const { toast } = useToast()
  const [emails, setEmails] = useState('')

  const { execute, isPending } = useLatitudeAction(enqueueWeeklyEmailAction, {
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Weekly email job has been enqueued successfully',
      })
      setEmails('')
      onOpenChange(false)
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to enqueue weekly email',
        variant: 'destructive',
      })
    },
  })

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    await execute({
      workspaceId,
      emails: emails.trim() || undefined,
    })
  }

  return (
    <Modal
      dismissible
      open={open}
      onOpenChange={onOpenChange}
      title='Send Weekly Email'
      description={`Manually trigger a weekly email report for workspace #${workspaceId}.`}
      footer={
        <>
          <CloseTrigger />
          <Button
            fancy
            form='weeklyEmailForm'
            type='submit'
            disabled={isPending}
            isLoading={isPending}
          >
            Send Weekly Email
          </Button>
        </>
      }
    >
      <form id='weeklyEmailForm' onSubmit={handleSubmit}>
        <FormWrapper>
          <TextArea
            label='Email Addresses (Optional)'
            name='emails'
            placeholder='email1@example.com, email2@example.com'
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            rows={4}
            description='Comma-separated list of email addresses. If left empty, the email will be sent to all workspace members who have opted in.'
          />
        </FormWrapper>
      </form>
    </Modal>
  )
}
