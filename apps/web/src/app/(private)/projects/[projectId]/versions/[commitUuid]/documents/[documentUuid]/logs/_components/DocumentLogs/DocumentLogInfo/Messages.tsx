import { useMemo } from 'react'

import { Message } from '@latitude-data/compiler'
import { ProviderLog } from '@latitude-data/core/browser'
import { MessageList } from '@latitude-data/web-ui'

export function DocumentLogMessages({
  providerLogs,
}: {
  providerLogs?: ProviderLog[]
}) {
  const messages = useMemo<Message[]>(
    () =>
      (providerLogs?.[providerLogs.length - 1]?.messages ?? []) as Message[],
    [providerLogs],
  )

  if (!providerLogs) return null
  return (
    <div className='flex flex-col gap-6 py-6 w-full max-h-full overflow-y-auto'>
      <MessageList messages={messages} />
    </div>
  )
}
