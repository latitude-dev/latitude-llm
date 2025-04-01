import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Popover } from '@latitude-data/web-ui/atoms/Popover'
import { Text } from '@latitude-data/web-ui/atoms/Text'

import { RewardsContent } from './Content'

export function RewardsButton() {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button size='small' variant='shiny'>
          <Text.H6 color='accentForeground' noWrap ellipsis>
            Get rewards!
          </Text.H6>
        </Button>
      </Popover.Trigger>
      <Popover.Content side='bottom' align='end' size='medium'>
        <RewardsContent />
      </Popover.Content>
    </Popover.Root>
  )
}
