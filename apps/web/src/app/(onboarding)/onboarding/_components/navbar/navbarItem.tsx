import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  StatusFlag,
  StatusFlagState,
} from '@latitude-data/web-ui/molecules/StatusFlag'

export enum NavbarTab {
  'setupIntegrations',
  'configureTriggers',
  'triggerAgent',
  'runAgent',
}

export function NavBarItem({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className='flex flex-row gap-2'>
      <StatusFlag state={StatusFlagState.inProgress} />
      <div className='flex flex-col'>
        <Text.H5M color='secondaryForeground'>{title}</Text.H5M>
        <Text.H5 color='foregroundMuted'>{description}</Text.H5>
      </div>
    </div>
  )
}
