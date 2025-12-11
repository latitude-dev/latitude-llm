'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { enqueueWeeklyEmailAction } from '$/actions/admin/weeklyEmail/enqueueWeeklyEmail'
import useLatitudeAction from '$/hooks/useLatitudeAction'

export function WeeklyEmailForm() {
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [workspaceId, setWorkspaceId] = useState('')
  const [emails, setEmails] = useState('')

  // Pre-fill workspaceId from query params if present
  useEffect(() => {
    const workspaceIdParam = searchParams.get('workspaceId')
    if (workspaceIdParam) {
      setWorkspaceId(workspaceIdParam)
    }
  }, [searchParams])

  const { execute: enqueueEmail, isPending } = useLatitudeAction(
    enqueueWeeklyEmailAction,
    {
      onSuccess: () => {
        toast({
          title: 'Success',
          description: 'Weekly email job has been enqueued successfully',
        })
        // Clear form
        setWorkspaceId('')
        setEmails('')
      },
      onError: (error) => {
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive',
        })
      },
    },
  )

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()

      const parsedWorkspaceId = parseInt(workspaceId)
      if (isNaN(parsedWorkspaceId)) {
        toast({
          title: 'Invalid Workspace ID',
          description: 'Please enter a valid numeric workspace ID',
          variant: 'destructive',
        })
        return
      }

      enqueueEmail({
        workspaceId: parsedWorkspaceId,
        emails: emails.trim() || undefined,
      })
    },
    [workspaceId, emails, enqueueEmail, toast],
  )

  return (
    <form onSubmit={handleSubmit} className='flex flex-col gap-y-4 max-w-2xl'>
      <div className='flex flex-col gap-y-2'>
        <Text.H5 weight='medium'>Workspace ID</Text.H5>
        <Input
          type='number'
          placeholder='Enter workspace ID'
          value={workspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
          required
        />
        <Text.H6 color='foregroundMuted'>
          The ID of the workspace to send the weekly email for
        </Text.H6>
      </div>

      <div className='flex flex-col gap-y-2'>
        <Text.H5 weight='medium'>Email Addresses (Optional)</Text.H5>
        <TextArea
          placeholder='email1@example.com, email2@example.com'
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          rows={4}
        />
        <Text.H6 color='foregroundMuted'>
          Comma-separated list of email addresses. If left empty, the email will
          be sent to all workspace members who have opted in to receive weekly
          emails.
        </Text.H6>
      </div>

      <div className='flex gap-2'>
        <Button type='submit' fancy disabled={isPending}>
          {isPending ? 'Enqueueing...' : 'Enqueue Weekly Email'}
        </Button>
      </div>
    </form>
  )
}
