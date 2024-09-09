import { ReactNode } from 'react'

import { cn } from '../../../lib/utils'
import { Icon, Text } from '../../atoms'

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
        <Icon name='logoMonochrome' size='xxxlarge' />
        <Text.H5 align='center' color='foregroundMuted'>
          {message}
        </Text.H5>
      </div>
      {submit}
    </div>
  )
}
