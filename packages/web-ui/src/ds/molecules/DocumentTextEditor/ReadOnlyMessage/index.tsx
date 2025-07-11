import { Icon } from '../../../atoms/Icons'
import { Text } from '../../../atoms/Text'

export function EditorReadOnlyBanner({
  readOnlyMessage,
}: {
  readOnlyMessage?: string
}) {
  if (!readOnlyMessage) return null
  return (
    <div className='flex flex-row w-full items-center justify-center px-2 gap-2 py-2'>
      <Icon name='lock' color='foregroundMuted' />
      <Text.H6 color='foregroundMuted'>
        Version published. {readOnlyMessage}
      </Text.H6>
    </div>
  )
}
