import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'

export const TooltipInfo = ({ text }: { text: string }) => (
  <Tooltip
    trigger={
      <div>
        <Icon name='info' color='primary' />
      </div>
    }
  >
    {text}
  </Tooltip>
)
