'use client'

import { manualEmailTriggerAction } from '$/actions/admin/documentTriggers/manualTrigger/email'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { Button, FormWrapper, Input, TextArea } from '@latitude-data/web-ui'
import { FormEvent, useCallback } from 'react'

export default function SendEmailTrigger() {
  const { execute, isPending } = useLatitudeAction(manualEmailTriggerAction)
  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const formData = new FormData(e.currentTarget)

      const sender = formData.get('sender')?.toString()
      if (!sender) return

      const recipient = formData.get('recipient')?.toString()
      if (!recipient) return

      const subject = formData.get('subject')?.toString()
      if (!subject) return

      const content = formData.get('content')?.toString()
      if (!content) return

      const messageId = formData.get('messageId')?.toString()

      await execute({ sender, recipient, subject, body: content, messageId })
    },
    [execute],
  )

  return (
    <form onSubmit={handleSubmit}>
      <FormWrapper>
        <Input
          label='Sender email'
          name='sender'
          placeholder='user@latitude.so'
        />
        <Input
          label='Receiver email'
          name='recipient'
          placeholder='<document-uuid>@prompt.latitude.so'
        />
        <Input
          label='Subject'
          name='subject'
          placeholder='Subject of the email'
        />
        <Input
          label='Message ID (optional)'
          name='messageId'
          placeholder='Optional message ID – Allows sending the response as a reply'
        />
        <TextArea
          label='Content'
          name='content'
          placeholder='Content of the email'
        />
        <Button type='submit' disabled={isPending}>
          Send
        </Button>
      </FormWrapper>
    </form>
  )
}
