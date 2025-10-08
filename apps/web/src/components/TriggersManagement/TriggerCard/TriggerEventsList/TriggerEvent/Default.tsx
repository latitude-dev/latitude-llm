import { relativeTimeForDate } from '$/lib/relativeTime'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { DocumentTriggerEvent } from '@latitude-data/core/schema/types'
import { cn } from '@latitude-data/web-ui/utils'

export function DefaultTriggerEvent({
  event,
  handleRunTrigger,
  isNew,
}: {
  event: DocumentTriggerEvent
  handleRunTrigger: () => void
  isNew: boolean
}) {
  return (
    <div
      className={cn('flex items-center justify-between p-4', {
        'bg-primary-muted': isNew,
      })}
    >
      <Text.H5>{relativeTimeForDate(event.createdAt)}</Text.H5>
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
