import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Popover } from '@latitude-data/web-ui/atoms/Popover'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { RewardsContent } from './Content'

export function RewardsButton() {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button
          variant='shinyLatte'
          size='tiny'
          iconProps={{
            name: 'gift',
            placement: 'right',
            size: 'normal',
            color: 'latteInputForeground',
            className: 'flex-shrink-0 -mt-px',
          }}
          className='relative'
          containerClassName='flex-shrink-0'
        >
          <Text.H6M color='latteInputForeground' userSelect={false}>
            Get Rewards!
          </Text.H6M>
        </Button>
      </Popover.Trigger>
      <Popover.Content
        side='bottom'
        align='end'
        size='xmedium'
        className='!rounded-xl !pb-2'
        maxHeight='none'
      >
        <RewardsContent />
      </Popover.Content>
    </Popover.Root>
  )
}
