import { ReactNode } from 'react'

import { TextColor } from '../../tokens'
import { Icon } from '../Icons'
import {
  AlertDescription,
  AlertProps,
  AlertRoot,
  AlertTitle,
} from './Primitives'
import { cn } from '../../../lib/utils'

type Props = {
  variant?: AlertProps['variant']
  title?: string | ReactNode
  description?: string | ReactNode
  direction?: 'row' | 'column'
  cta?: ReactNode
  showIcon?: boolean
  centered?: boolean
}

const IconColor: Record<string, TextColor> = {
  destructive: 'destructive',
  success: 'success',
  warning: 'warningMutedForeground',
  default: 'foreground',
}

export function Alert({
  title,
  description,
  direction = 'row',
  cta,
  showIcon = true,
  variant = 'default',
  centered = false,
}: Props) {
  return (
    <AlertRoot variant={variant}>
      {showIcon && (
        <Icon
          className='mt-0.5' // To align with the Title leading
          name='alert'
          color={variant ? IconColor[variant] || 'foreground' : 'foreground'}
        />
      )}
      <div
        className={cn('flex items-center gap-4 lg:gap-8 justify-between', {
          'flex-row ': direction === 'row',
          'flex-col': direction === 'column',
          'justify-center': centered,
        })}
      >
        <div className='flex flex-col gap-2 whitespace-pre-wrap'>
          {title && <AlertTitle>{title}</AlertTitle>}
          {description && <AlertDescription>{description}</AlertDescription>}
        </div>
        {cta}
      </div>
    </AlertRoot>
  )
}
