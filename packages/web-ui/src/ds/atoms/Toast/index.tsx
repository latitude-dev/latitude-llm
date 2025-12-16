'use client'

import * as ToastPrimitives from '@radix-ui/react-toast'
import { type VariantProps } from 'class-variance-authority'
import {
  ComponentPropsWithRef,
  ComponentRef,
  forwardRef,
  ReactElement,
} from 'react'

import { cn } from '../../../lib/utils'
import { Icon } from '../Icons'

import { toastVariants } from './toastVariants'

const ToastProviderPrimitive = ToastPrimitives.Provider

const ToastViewport = forwardRef<
  ComponentRef<typeof ToastPrimitives.Viewport>,
  ComponentPropsWithRef<typeof ToastPrimitives.Viewport>
>(function ToastViewport({ className, ...props }, ref) {
  return (
    <ToastPrimitives.Viewport
      ref={ref}
      className={cn(
        'fixed z-[100] flex max-h-screen w-full gap-y-4 flex-col-reverse p-4 sm:flex-col md:max-w-[420px]',
        'top-0 sm:bottom-[48px] sm:left-0 sm:top-auto',
        className,
      )}
      {...props}
    />
  )
})

const Toast = forwardRef<
  ComponentRef<typeof ToastPrimitives.Root>,
  ComponentPropsWithRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(function Toast({ className, variant, ...props }, ref) {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  )
})

const ToastAction = forwardRef<
  ComponentRef<typeof ToastPrimitives.Action>,
  ComponentPropsWithRef<typeof ToastPrimitives.Action>
>(function ToastAction({ className, ...props }, ref) {
  return (
    <ToastPrimitives.Action
      ref={ref}
      className={cn(
        'inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium transition-colors hover:bg-secondary focus:outline-none focus:ring-1 focus:ring-ring disabled:pointer-events-none disabled:opacity-50',
        'group-[.destructive]:border-muted/40 group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus:ring-destructive',
        'group-[.accent]:text-accent-foreground group-[.accent]:hover:text-accent-foreground/70 group-[.accent]:focus:ring-accent-button group-[.accent]:focus:ring-offset-accent',
        'group-[.warning]:border-yellow-400 group-[.warning]:hover:border-yellow-500 group-[.warning]:hover:bg-yellow-100 group-[.warning]:hover:text-yellow-900 group-[.warning]:focus:ring-yellow-500',
        className,
      )}
      {...props}
    />
  )
})

const ToastClose = forwardRef<
  ComponentRef<typeof ToastPrimitives.Close>,
  ComponentPropsWithRef<typeof ToastPrimitives.Close>
>(function ToastClose({ className, ...props }, ref) {
  return (
    <ToastPrimitives.Close
      ref={ref}
      className={cn(
        'absolute right-1 top-1 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-1 group-hover:opacity-100 group-[.destructive]:text-red-300 group-[.destructive]:hover:text-red-50 group-[.destructive]:focus:ring-red-400 group-[.destructive]:focus:ring-offset-red-600',
        'group-[.accent]:text-accent-foreground group-[.accent]:hover:text-accent-foreground/70 group-[.accent]:focus:ring-accent-button group-[.accent]:focus:ring-offset-accent',
        'group-[.warning]:text-yellow-700 group-[.warning]:hover:text-yellow-900 group-[.warning]:focus:ring-yellow-500 group-[.warning]:focus:ring-offset-yellow-50 dark:group-[.warning]:text-yellow-300 dark:group-[.warning]:hover:text-yellow-100',
        className,
      )}
      toast-close=''
      {...props}
    >
      <Icon name='close' />
    </ToastPrimitives.Close>
  )
})

const ToastTitle = forwardRef<
  ComponentRef<typeof ToastPrimitives.Title>,
  ComponentPropsWithRef<typeof ToastPrimitives.Title>
>(function ToastTitle({ className, ...props }, ref) {
  return (
    <ToastPrimitives.Title
      ref={ref}
      className={cn('text-sm font-semibold [&+div]:text-xs', className)}
      {...props}
    />
  )
})

const ToastDescription = forwardRef<
  ComponentRef<typeof ToastPrimitives.Description>,
  ComponentPropsWithRef<typeof ToastPrimitives.Description>
>(function ToastDescription({ className, ...props }, ref) {
  return (
    <ToastPrimitives.Description
      ref={ref}
      className={cn('text-sm opacity-90', className)}
      {...props}
    />
  )
})

type ToastProps = ComponentPropsWithRef<typeof Toast>

type ToastActionElement = ReactElement<typeof ToastAction>

export {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProviderPrimitive,
  ToastTitle,
  ToastViewport,
  type ToastActionElement,
  type ToastProps,
}

export { ToastHref } from './ToastHref'

export { toast, useToast } from './useToast'

export * from './ToastProvider'
