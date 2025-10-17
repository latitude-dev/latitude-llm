import { relativeTimeForDate } from '$/lib/relativeTime'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { DocumentTriggerType } from '@latitude-data/constants'
import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { DocumentTriggerEvent } from '@latitude-data/core/schema/models/types/DocumentTriggerEvent'

import { cn } from '@latitude-data/web-ui/utils'

export function IntegrationTriggerEvent({
  event,
  handleRunTrigger,
  isNew,
}: {
  event: DocumentTriggerEvent<DocumentTriggerType.Integration>
  handleRunTrigger: () => void
  isNew: boolean
}) {
  return (
    <div
      className={cn('flex flex-col gap-4 min-w-0 flex-grow p-4', {
        'bg-primary-muted': isNew,
      })}
    >
      <div className='flex items-center justify-between'>
        <Text.H5 noWrap color='foregroundMuted'>
          {relativeTimeForDate(event.createdAt)}
        </Text.H5>
        <Button
          fancy
          variant='outline'
          iconProps={{ name: 'circlePlay' }}
          onClick={handleRunTrigger}
        >
          Run
        </Button>
      </div>
      <CodeBlock language='json' className='max-h-40'>
        {JSON.stringify(event.payload, null, 2)}
      </CodeBlock>
    </div>
  )
}
