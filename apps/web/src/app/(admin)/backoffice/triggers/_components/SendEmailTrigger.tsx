'use client'
import { EMAIL_TRIGGER_DOMAIN } from '@latitude-data/constants'
import { manualEmailTriggerAction } from '$/actions/admin/documentTriggers/manualTrigger/email'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { type ChangeEvent, type FormEvent, useCallback, useState } from 'react'

export default function SendEmailTrigger() {
  const { execute, isPending } = useLatitudeAction(manualEmailTriggerAction)
  const [files, setFiles] = useState<File[]>([])

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files))
    }
  }

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const formData = new FormData(e.currentTarget)

      const senderEmail = formData.get('senderEmail')?.toString()
      if (!senderEmail) return

      const senderName = formData.get('senderName')?.toString()
      if (!senderName) return

      const recipient = formData.get('recipient')?.toString()
      if (!recipient) return

      const subject = formData.get('subject')?.toString()
      if (!subject) return

      const content = formData.get('content')?.toString()
      if (!content) return

      const messageId = formData.get('messageId')?.toString()
      const references = formData.get('references')?.toString()

      await execute({
        senderEmail,
        senderName,
        recipient,
        subject,
        body: content,
        messageId,
        references,
        files,
      })
    },
    [execute, files],
  )

  return (
    <form onSubmit={handleSubmit}>
      <FormWrapper>
        <div className='flex flex-row w-full gap-4'>
          <Input label='Sender name' name='senderName' placeholder='John Doe' />
          <Input label='Sender email' name='senderEmail' placeholder='user@latitude.so' />
        </div>
        <Input
          label='Receiver email'
          name='recipient'
          placeholder={`<document-uuid>@${EMAIL_TRIGGER_DOMAIN}`}
        />
        <Input label='Subject' name='subject' placeholder='Subject of the email' />
        <Input
          label='Message ID (optional)'
          name='messageId'
          placeholder='Optional message ID – Allows sending the response as a reply'
        />
        <Input
          label='Thread Message IDs (optional)'
          name='references'
          placeholder='Optional list of past message IDs – Used to add follow-up messages to a previous conversation'
        />
        <TextArea label='Content' name='content' placeholder='Content of the email' />
        <Input
          type='file'
          label='Attachments'
          name='attachments'
          multiple
          onChange={handleFileChange}
        />
        <Button type='submit' disabled={isPending}>
          Send
        </Button>
      </FormWrapper>
    </form>
  )
}
