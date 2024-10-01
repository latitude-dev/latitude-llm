import { Button, Popover, Text } from '@latitude-data/web-ui'

import { RewardsContent } from './Content'

export function RewardsButton() {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button size='small' variant='shiny'>
          <Text.H6 color='primary' noWrap ellipsis>
            Get rewards!
          </Text.H6>
        </Button>
      </Popover.Trigger>
      <Popover.Content
        side='bottom'
        sideOffset={8}
        align='center'
        className='bg-background rounded-lg w-[400px] shadow-lg border border-border'
      >
        <RewardsContent />
      </Popover.Content>
    </Popover.Root>
  )
}
