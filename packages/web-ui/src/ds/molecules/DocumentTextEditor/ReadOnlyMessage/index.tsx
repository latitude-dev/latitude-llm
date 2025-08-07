import { cn } from '../../../../lib/utils'
import { Icon } from '../../../atoms/Icons'
import { Text } from '../../../atoms/Text'

export function EditorReadOnlyBanner({
  readOnlyMessage,
  className,
}: {
  readOnlyMessage?: string
  className?: string
}) {
  if (!readOnlyMessage) return null
  return (
    <div
      className={cn('flex flex-row w-full items-center justify-center px-2 pt-3 gap-2', className)}
    >
      <Icon name='lock' color='foregroundMuted' />
      <Text.H6 color='foregroundMuted' userSelect={false}>
        Version published. {readOnlyMessage}
      </Text.H6>
    </div>
  )
}
