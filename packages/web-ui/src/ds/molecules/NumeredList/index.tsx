import { Children, type ReactNode } from 'react'

import { cn } from '../../../lib/utils'
import { Text } from '../../atoms/Text'

const NumeredList = ({ children }: { children: ReactNode }) => {
  return (
    <ol className='flex flex-col gap-y-8'>
      {Children.toArray(children).map((child, index) => (
        <li key={index} className='flex flex-row items-start gap-x-2'>
          <div className='flex-none min-w-5 min-h-5 flex items-center justify-center bg-accent rounded'>
            <Text.H5M color='accentForeground'>{index + 1}</Text.H5M>
          </div>
          {child}
        </li>
      ))}
    </ol>
  )
}

NumeredList.Item = ({
  children,
  title,
  width,
  className,
}: {
  title: string
  children: ReactNode
  width?: string
  className?: string
}) => {
  return (
    <div className={cn('flex-grow min-w-0 flex flex-col gap-y-4', className)}>
      <Text.H5>{title}</Text.H5>
      {children ? <div className={cn(width, { 'w-full': !width })}>{children}</div> : null}
    </div>
  )
}

export { NumeredList }
