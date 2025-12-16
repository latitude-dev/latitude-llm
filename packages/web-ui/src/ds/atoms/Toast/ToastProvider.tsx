'use client'

import { cn } from '../../../lib/utils'
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProviderPrimitive,
  ToastTitle,
  ToastViewport,
  useToast,
} from './index'
import { ToastHref } from './ToastHref'

export function ToastProvider({ duration }: { duration: number }) {
  const { toasts } = useToast()

  return (
    <ToastProviderPrimitive duration={duration}>
      {toasts.map(function ({
        id,
        title,
        description,
        href,
        action,
        variant,
        ...props
      }) {
        return (
          <Toast key={id} variant={variant} {...props}>
            <div className='grid gap-1'>
              {title && (
                <ToastTitle className={cn(href && 'font-normal')}>
                  {title}
                </ToastTitle>
              )}
              {description && (
                <ToastDescription>
                  {href ? (
                    <ToastHref href={href} variant={variant}>
                      {description}
                    </ToastHref>
                  ) : (
                    description
                  )}
                </ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProviderPrimitive>
  )
}
