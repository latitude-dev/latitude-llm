import { Text } from '@latitude-data/web-ui/atoms/Text'
import { StatusFlag } from '@latitude-data/web-ui/molecules/StatusFlag'
import { StatusFlagState } from '../../constants'
import { colors } from '@latitude-data/web-ui/tokens'

const statusFlagColors: Record<StatusFlagState, string> = {
  [StatusFlagState.pending]: colors.backgrounds.mutedForeground,
  [StatusFlagState.inProgress]: colors.backgrounds.latte,
  [StatusFlagState.completed]: colors.backgrounds.mutedForeground,
}

export function NavBarItem({
  title,
  description,
  state,
}: {
  title: string
  description: string
  state: StatusFlagState
}) {
  return (
    <div className='flex flex-row gap-2'>
      <StatusFlag state={state} backgroundColor={statusFlagColors[state]} />
      <div className='flex flex-col'>
        <Text.H5M color='secondaryForeground'>{title}</Text.H5M>
        <Text.H5 color='foregroundMuted'>{description}</Text.H5>
      </div>
    </div>
  )
}
