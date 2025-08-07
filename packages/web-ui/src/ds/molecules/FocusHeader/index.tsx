import { Icon } from '../../atoms/Icons'
import { Text } from '../../atoms/Text'

export function FocusHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className='flex flex-col items-center justify-center gap-y-6'>
      <Icon name='logo' size='xlarge' />
      <div className='flex flex-col items-center justify-center gap-y-2'>
        <Text.H3 align='center' color='foreground'>
          {title}
        </Text.H3>
        {description && (
          <Text.H5 align='center' color='foregroundMuted'>
            {description}
          </Text.H5>
        )}
      </div>
    </div>
  )
}
