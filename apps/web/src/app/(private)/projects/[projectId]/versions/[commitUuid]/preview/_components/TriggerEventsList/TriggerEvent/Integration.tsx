import { relativeTimeForDate } from '$/lib/relativeTime'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { DocumentTriggerEvent } from '@latitude-data/core/browser'
import { DocumentTriggerType } from '@latitude-data/constants'
import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'

export function IntegrationTriggerEvent({
  event,
  handleRunTrigger,
}: {
  event: DocumentTriggerEvent<DocumentTriggerType.Integration>
  handleRunTrigger: () => void
}) {
  return (
    <div className='flex flex-col gap-4 min-w-0 flex-grow p-4'>
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
