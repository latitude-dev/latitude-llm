import { ReactNode } from 'react'

import { Icon } from '../Icons'
import {
  AlertDescription,
  AlertProps,
  AlertRoot,
  AlertTitle,
} from './Primitives'

type Props = {
  variant?: AlertProps['variant']
  title?: string
  description?: string
  cta?: ReactNode
  showIcon?: boolean
}
export function Alert({
  title,
  description,
  cta,
  showIcon = true,
  variant = 'default',
}: Props) {
  return (
    <AlertRoot variant={variant}>
      {showIcon && <Icon name='alert' />}
      <div className='flex flex-row items-center gap-4 justify-between'>
        <div className='flex flex-col gap-2'>
          {title && <AlertTitle>{title}</AlertTitle>}
          {description && <AlertDescription>{description}</AlertDescription>}
        </div>
        {cta}
      </div>
    </AlertRoot>
  )
}
