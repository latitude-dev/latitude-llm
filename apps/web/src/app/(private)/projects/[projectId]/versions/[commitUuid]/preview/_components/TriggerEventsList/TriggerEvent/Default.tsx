import { relativeTimeForDate } from '$/lib/relativeTime'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { DocumentTriggerEvent } from '@latitude-data/core/browser'

export function DefaultTriggerEvent({
  event,
  handleRunTrigger,
}: {
  event: DocumentTriggerEvent
  handleRunTrigger: () => void
}) {
  return (
    <div className='flex items-center justify-between p-4'>
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
