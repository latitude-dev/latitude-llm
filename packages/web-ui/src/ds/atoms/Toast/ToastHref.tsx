'use client'

import { VariantProps } from 'class-variance-authority'
import { ReactNode } from 'react'

import { TextColor } from '../../tokens'
import { Button } from '../Button'

import { toastVariants } from './toastVariants'

function getToastHrefColor(
  variant: VariantProps<typeof toastVariants>['variant'],
): TextColor {
  switch (variant) {
    case 'destructive':
      return 'destructiveForeground'
    case 'accent':
      return 'accentForeground'
    case 'warning':
      return 'warningMutedForeground'
    default:
      return 'primary'
  }
}

export function ToastHref({
  href,
  variant,
  children,
}: {
  href: string
  variant?: VariantProps<typeof toastVariants>['variant']
  children: ReactNode
}) {
  const color = getToastHrefColor(variant)
  return (
    <a href={href}>
      <Button
        variant='link'
        size='none'
        textColor={color}
        iconProps={{
          name: 'arrowRight',
          color,
          size: 'normal',
          placement: 'right',
          strokeWidth: 2.5,
        }}
      >
        {children}
      </Button>
    </a>
  )
}
