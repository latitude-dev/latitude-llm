'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { cn } from '../../../lib/utils'
import { Icon } from '../../atoms/Icons'

export type YoutubeVideoModalProps = {}

/**
 * A modal component for displaying YouTube videos with a clean, minimal design.
 * Features a dismissible overlay and a circular close button.
 */
export function YoutubeVideoModal({
  open,
  onOpenChange,
  videoId,
  autoPlay = false,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  videoId: string
  autoPlay?: boolean
}) {
  const embedUrl = `https://www.youtube.com/embed/${videoId}${autoPlay ? '?autoplay=1' : ''}`

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/70 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            'w-full max-w-[1200px] px-6',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[state=closed]:slide-out-to-left-1/2 data-[state=open]:slide-in-from-left-1/2',
            'data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-top-[48%]',
            'duration-200 focus:outline-none',
          )}
        >
          <VisuallyHidden>
            <DialogPrimitive.Title>
              YouTube video from Latitude
            </DialogPrimitive.Title>
          </VisuallyHidden>
          <div className='relative'>
            <DialogPrimitive.Close
              className={cn(
                'absolute -top-5 -right-5 z-10',
                'flex items-center justify-center',
                'h-10 w-10 rounded-full',
                'bg-white shadow-lg',
                'transition-transform hover:scale-105',
                'focus:outline-none focus:ring-2 focus:ring-white/50',
              )}
              aria-label='Close'
            >
              <Icon name='close' color='foreground' size='medium' />
            </DialogPrimitive.Close>

            <div className='relative w-full overflow-hidden rounded-2xl bg-black shadow-2xl aspect-video'>
              <iframe
                className='absolute inset-0 h-full w-full'
                src={embedUrl}
                title='Latest Video'
                allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
                allowFullScreen
              />
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
