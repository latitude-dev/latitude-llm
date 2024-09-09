import { ReactNode } from 'react'

import { Text } from '../../atoms'

export const TitleWithActions = ({
  title,
  actions,
}: {
  title: string | ReactNode
  actions?: ReactNode
}) => {
  return (
    <div className='flex flex-row justify-between items-center gap-4'>
      {typeof title === 'string' ? <Text.H4B>{title}</Text.H4B> : title}
      {actions ? <div className='flex gap-1'>{actions}</div> : null}
    </div>
  )
}
