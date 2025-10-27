import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'

export function SimulationTag() {
  return (
    <Tooltip
      asChild
      trigger={
        <Badge variant='warningMuted'>
          <div className='flex flex-row items-center gap-1'>
            <Icon name='brush' color='warningMutedForeground' />
            <Text.H6B color='warningMutedForeground'>Simulated</Text.H6B>
          </div>
        </Badge>
      }
    >
      This tool has been simulated and the results AI-generated. The real tool
      has not been executed.
    </Tooltip>
  )
}
