import { ReactNode } from 'react'

import { Text } from '../../atoms'

export const TitleWithActions = ({
  title,
  actions,
}: {
  title: string
  actions?: ReactNode
}) => {
  return (
    <div className='flex flex-row justify-between items-center gap-4'>
      <Text.H4B>{title}</Text.H4B>
      {actions ? <div className='flex gap-1'>{actions}</div> : null}
    </div>
  )
}
