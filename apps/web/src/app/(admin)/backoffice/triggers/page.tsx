'use client'
import { DocumentTriggerType } from '@latitude-data/constants'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useState } from 'react'
import SendEmailTrigger from './_components/SendEmailTrigger'

export default function AdminTriggerPage() {
  const [triggerType, setTriggerType] = useState<DocumentTriggerType>(
    DocumentTriggerType.Email,
  )

  return (
    <div className='container flex flex-col gap-y-4'>
      <Text.H1>Send trigger</Text.H1>
      <Select
        name='triggerType'
        label='Trigger type'
        value={triggerType}
        options={Object.values(DocumentTriggerType).map((type) => ({
          label: type,
          value: type,
        }))}
        onChange={setTriggerType}
      />
      {triggerType === DocumentTriggerType.Email && <SendEmailTrigger />}
    </div>
  )
}
