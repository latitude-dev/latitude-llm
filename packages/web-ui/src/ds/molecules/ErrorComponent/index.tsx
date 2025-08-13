import { ReactNode } from 'react'

import { cn } from '../../../lib/utils'
import { Icon } from '../../atoms/Icons'
import { Text } from '../../atoms/Text'

export function ErrorComponent({
  message,
  type,
  submit,
}: {
  message: string
  type: 'gray' | 'red'
  submit?: ReactNode
}) {
  return (
    <div className='w-full h-full flex flex-col items-center justify-center gap-4 max-w-80 m-auto'>
      <div
        className={cn('flex flex-col items-center justify-center gap-y-8', {
          'text-muted-foreground': type === 'gray',
          'text-destructive': type === 'red',
        })}
      >
        <Icon name='logoMonochrome' size='xxxlarge' className='opacity-25' />
        <div className='flex flex-col items-center justify-center gap-y-2'>
          <Text.H4B align='center' color='foregroundMuted'>
            Oh no... something went wrong!
          </Text.H4B>
          <Text.H5 align='center' color='foregroundMuted'>
            {message}
          </Text.H5>
        </div>
      </div>
      {submit}
    </div>
  )
}
