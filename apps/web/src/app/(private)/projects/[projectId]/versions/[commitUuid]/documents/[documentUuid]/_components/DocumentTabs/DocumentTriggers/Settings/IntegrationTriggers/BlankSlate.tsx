import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TriggersPreview } from './Preview'
import { useCurrentCommit } from '@latitude-data/web-ui/providers'

export function TriggersBlankSlate({
  openTriggerModal,
}: {
  openTriggerModal: () => void
}) {
  const { isHead } = useCurrentCommit()

  return (
    <div className='flex flex-col items-center w-full gap-4 p-4'>
      <div className='flex flex-col w-full items-center max-w-[300px] gap-2'>
        <Text.H5B>Add Triggers</Text.H5B>
        <Text.H5 color='foregroundMuted' centered>
          Add triggers to execute this prompt automatically based on events or
          schedules.
        </Text.H5>
      </div>
      <TriggersPreview />
      <div className='max-w-[300px] w-full'>
        <Button
          fullWidth
          fancy
          variant='default'
          onClick={openTriggerModal}
          disabled={!isHead}
        >
          Add Trigger
        </Button>
      </div>
    </div>
  )
}
