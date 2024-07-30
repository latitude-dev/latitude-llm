'use client'

import {
  ComponentPropsWithoutRef,
  ElementRef,
  forwardRef,
  HTMLAttributes,
} from 'react'
import { X } from 'lucide-react'
import * as DialogPrimitive from '@radix-ui/react-dialog'

import Text from '$ui/ds/atoms/Text'
import { cn } from '$ui/lib/utils'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className: _cn, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/60',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className: _cn, children, forceMount, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay forceMount={forceMount} />
    <DialogPrimitive.Content
      ref={ref}
      forceMount={forceMount}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg',
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className='absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground'>
        <X className='h-4 w-4' />
        <span className='sr-only'>Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col space-y-1.5 text-center sm:text-left',
      className,
    )}
    {...props}
  />
)
DialogHeader.displayName = 'DialogHeader'

const DialogFooter = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
      className,
    )}
    {...props}
  />
)
DialogFooter.displayName = 'DialogFooter'

type DialogTitleProps = Omit<
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>,
  'className'
>
const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  DialogTitleProps
>(({ children, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} {...props}>
    <Text.H4M>{children}</Text.H4M>
  </DialogPrimitive.Title>
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

type DialogDescriptionProps = Omit<
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>,
  'className'
>
const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  DialogDescriptionProps
>(({ children, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className='text-sm text-muted-foreground'
    {...props}
  >
    <Text.H5 color='foregroundMuted'>{children}</Text.H5>
  </DialogPrimitive.Description>
))

DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
