import type { ReactNode } from 'react'

import { cn } from '../../../lib/utils'
import { Text } from '../../atoms/Text'

export type TitleWithActionsVerticalAligment = 'center' | 'bottom'
export const TitleWithActions = ({
  title,
  actions,
  verticalAligment = 'center',
}: {
  title: string | ReactNode
  actions?: ReactNode
  verticalAligment?: TitleWithActionsVerticalAligment
}) => {
  return (
    <div
      className={cn('flex flex-row flex-grow min-w-0 justify-between gap-4', {
        'items-center': verticalAligment === 'center',
        'items-end': verticalAligment === 'bottom',
      })}
    >
      {typeof title === 'string' ? <Text.H4B>{title}</Text.H4B> : title}
      {actions ? (
        <div className='flex gap-1 flex-grow shrink-0 justify-end gap-x-2'>{actions}</div>
      ) : null}
    </div>
  )
}
