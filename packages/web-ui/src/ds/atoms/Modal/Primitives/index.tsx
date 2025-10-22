'use client'

import {
  ComponentPropsWithoutRef,
  ElementRef,
  forwardRef,
  HTMLAttributes,
  ReactNode,
  useCallback,
} from 'react'
import { X } from 'lucide-react'
import * as DialogPrimitive from '@radix-ui/react-dialog'

import { cn } from '../../../../lib/utils'
import { Text } from '../../Text'

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
      'fixed inset-0 z-50 bg-white/60 dark:bg-black/60 backdrop-blur-sm backdrop-saturate-200',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

export type DialogContentProps = Omit<
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
  'onEscapeKeyDown' | 'onPointerDownOutside' | 'onInteractOutside'
> & {
  // By default clicking outside the dialog does not dismiss it
  // Pressing ESC will neither dismiss the dialog
  dismissible: boolean
  height?: 'content' | 'screen'
}
const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(
  (
    {
      className: _cn,
      children,
      forceMount,
      dismissible = false,
      height = 'content',
      ...props
    },
    ref,
  ) => {
    const onEscapeKeyDown = useCallback(
      (event: KeyboardEvent) => {
        if (dismissible) return

        event.preventDefault()
      },
      [dismissible],
    )
    const onPointerDownOutside = useCallback(
      (event: CustomEvent<{ originalEvent: PointerEvent }>) => {
        if (dismissible) return

        event.preventDefault()
      },
      [dismissible],
    )
    const onInteractOutside = useCallback(
      (event: CustomEvent<{ originalEvent: Event }>) => {
        if (dismissible) return

        event.preventDefault()
      },
      [dismissible],
    )
    return (
      <DialogPortal>
        <DialogOverlay forceMount={forceMount} />
        <DialogPrimitive.Content
          ref={ref}
          forceMount={forceMount}
          className={cn(
            // base: centered + common anims
            'fixed left-1/2 top-1/2 z-50 grid w-full -translate-x-1/2 -translate-y-1/2 gap-4 bg-background shadow-lg rounded-2xl duration-200',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            // always keep X-axis slide
            'data-[state=closed]:slide-out-to-left-1/2 data-[state=open]:slide-in-from-left-1/2',
            _cn,
            {
              'max-h-[90%] border dark:border': height === 'content',
              // only content height gets vertical slide
              'data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-top-[48%]':
                height === 'content',
              'h-[96%]': height === 'screen',
            },
          )}
          onEscapeKeyDown={onEscapeKeyDown}
          onPointerDownOutside={onPointerDownOutside}
          onInteractOutside={onInteractOutside}
          {...props}
        >
          {children}
          {dismissible ? (
            <DialogPrimitive.Close className='absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground'>
              <X className='h-4 w-4' />
              <span className='sr-only'>Close</span>
            </DialogPrimitive.Close>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPortal>
    )
  },
)
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

export type FooterProps = {
  children: ReactNode
  align?: 'right' | 'justify'
}
const DialogFooter = ({ children, align = 'right' }: FooterProps) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
      {
        'sm:justify-end': align === 'right',
        'sm:justify-between': align === 'justify',
      },
    )}
  >
    {children}
  </div>
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

const DialogWarningDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  DialogDescriptionProps
>(({ children, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className='text-sm' {...props}>
    <Text.H5 color='warningMutedForeground'>{children}</Text.H5>
  </DialogPrimitive.Description>
))

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
  DialogWarningDescription,
}
