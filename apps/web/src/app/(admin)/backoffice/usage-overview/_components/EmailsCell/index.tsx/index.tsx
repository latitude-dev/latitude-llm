'use client'

import { ButtonTrigger, CopyButton, Popover, Text } from '@latitude-data/web-ui'

export function EmailsCell({
  firstEmail,
  rest,
}: {
  firstEmail: string | undefined
  rest: string[]
}) {
  if (!firstEmail) return 'No emails, weird'

  if (rest.length === 0) {
    return (
      <div className='flex items-center gap-x-2 w-full'>
        <div className='flex-none'>
          <CopyButton content={firstEmail} />
        </div>
        <Text.H6 ellipsis noWrap>
          {firstEmail}
        </Text.H6>
      </div>
    )
  }

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
