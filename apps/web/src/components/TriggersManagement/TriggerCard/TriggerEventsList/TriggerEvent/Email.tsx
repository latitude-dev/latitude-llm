import { relativeTimeForDate } from '$/lib/relativeTime'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { DocumentTriggerType } from '@latitude-data/constants'
import { DocumentTriggerEvent } from '@latitude-data/core/schema/models/types/DocumentTriggerEvent'

import { cn } from '@latitude-data/web-ui/utils'

export function EmailTriggerEvent({
  event,
  handleRunTrigger,
  isNew,
}: {
  event: DocumentTriggerEvent<DocumentTriggerType.Email>
  handleRunTrigger: () => void
  isNew: boolean
}) {
  return (
    <div
      className={cn('flex items-start justify-between p-4 gap-4', {
        'bg-primary-muted': isNew,
      })}
    >
      <div className='flex flex-col gap-1 min-w-0 flex-grow'>
        <div className='flex items-center gap-2'>
          <Text.H5B noWrap ellipsis>
            {event.payload.senderName ?? event.payload.senderEmail}
          </Text.H5B>
          <Text.H5 noWrap color='foregroundMuted'>
            {relativeTimeForDate(event.createdAt)}
          </Text.H5>
        </div>
        <Text.H5 noWrap ellipsis>
          {event.payload.subject}
        </Text.H5>
        <Text.H5 noWrap ellipsis color='foregroundMuted'>
          {event.payload.body}
        </Text.H5>
      </div>
      <Button
        fancy
        variant='outline'
        iconProps={{ name: 'circlePlay' }}
        onClick={handleRunTrigger}
      >
        Run
      </Button>
    </div>
  )
}
