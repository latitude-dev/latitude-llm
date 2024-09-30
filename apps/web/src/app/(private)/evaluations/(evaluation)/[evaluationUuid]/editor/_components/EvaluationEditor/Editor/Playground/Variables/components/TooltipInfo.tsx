import { Icon, Tooltip } from '@latitude-data/web-ui'

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
