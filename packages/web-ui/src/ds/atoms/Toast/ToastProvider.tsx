'use client'

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProviderPrimitive,
  ToastTitle,
  ToastViewport,
} from './index'
import { useToast } from './useToast'

export function ToastProvider({ duration }: { duration: number }) {
  const { toasts } = useToast()

  return (
    <ToastProviderPrimitive duration={duration}>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className='grid gap-1'>
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
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
