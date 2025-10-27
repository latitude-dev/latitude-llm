import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { User } from '@latitude-data/core/schema/models/types/User'

export default function OnboardingHeader({ user }: { user: User }) {
  return (
    <div className='flex flex-col items-center justify-center gap-6'>
      <Icon className='' name='logo' size='xlarge' />
      <div className='flex flex-col items-center justify-center gap-2'>
        <Text.H3M color='foreground' noWrap>
          Welcome to Latitude
        </Text.H3M>
        <Text.H5 color='foregroundMuted'>
          Hello {user.name || 'there'}! Let's help you get started
        </Text.H5>
      </div>
    </div>
  )
}
