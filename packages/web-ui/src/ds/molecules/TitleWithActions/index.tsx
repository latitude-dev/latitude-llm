import { ReactNode } from 'react'

import { Text } from '../../atoms/Text'

export const TitleWithActions = ({
  title,
  actions,
}: {
  title: string | ReactNode
  actions?: ReactNode
}) => {
  return (
    <div className='flex flex-row flex-grow min-w-0 justify-between items-center gap-4'>
      {typeof title === 'string' ? <Text.H4B>{title}</Text.H4B> : title}
      {actions ? (
        <div className='flex gap-1 flex-grow shrink min-w-0 justify-end gap-x-2'>
          {actions}
        </div>
      ) : null}
    </div>
  )
}
