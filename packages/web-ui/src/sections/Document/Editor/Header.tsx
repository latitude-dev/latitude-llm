import { ReactNode } from 'react'

import { Text } from '$ui/ds/atoms'

export function Header({
  title,
  children,
}: {
  title: string
  children?: ReactNode
}) {
  return (
    <div className='flex flex-row h-8 justify-between items-center'>
      <Text.H5M>{title}</Text.H5M>
      <div className='flex flex-row gap-2'>{children}</div>
    </div>
  )
}
