import { cn } from '../../../lib/utils'
import { Icons, Text } from '../../atoms'

export function ErrorComponent({
  message,
  type,
}: {
  message: string
  type: 'gray' | 'red'
}) {
  return (
    <div className='w-full h-full flex items-center justify-center'>
      <div
        className={cn('flex flex-col items-center gap-y-8 max-w-80', {
          'text-muted-foreground': type === 'gray',
          'text-destructive': type === 'red',
        })}
      >
        <Icons.logoMonochrome className='w-14 h-14' />
        <Text.H5 align='center' color='foregroundMuted'>
          {message}
        </Text.H5>
      </div>
    </div>
  )
}
