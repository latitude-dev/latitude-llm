'use client'

import { ButtonTrigger, Popover, Text } from '@latitude-data/web-ui'

export function EmailsCell({
  firstEmail,
  rest,
}: {
  firstEmail: string | undefined
  rest: string[]
}) {
  if (!firstEmail) return 'No emails, weird'

  if (rest.length === 0) return <Text.H6>{firstEmail}</Text.H6>

  return (
    <Popover.Root>
      <ButtonTrigger>{firstEmail}</ButtonTrigger>
      <Popover.Content side='bottom' align='end' size='medium'>
        <ul className='flex flex-col gap-y-3'>
          <li>{firstEmail}</li>
          {rest.map((email) => (
            <li key={email}>{email}</li>
          ))}
        </ul>
      </Popover.Content>
    </Popover.Root>
  )
}
