import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'

export default function DefaultProviderBanner() {
  return (
    <Tooltip
      trigger={
        <div>
          <Icon name='alert' color='warningMutedForeground' />
        </div>
      }
    >
      This evaluation is using the default Latitude provider. This provider has
      a limited number of free runs and is not recommended for running
      evaluations. Please use a different provider for production workloads.
    </Tooltip>
  )
}
