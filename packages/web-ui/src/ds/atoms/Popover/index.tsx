'use client'

import { forwardRef } from 'react'
import * as RadixPopover from '@radix-ui/react-popover'

import { cn } from '../../../lib/utils'

type Props = RadixPopover.PopoverContentProps & {
  inPortal?: boolean
  scrollable?: boolean
}
const PopoverContent = forwardRef<HTMLDivElement, Props>(function Content(
  { inPortal = true, scrollable = true, className = '', ...rest },
  ref,
) {
  const props = {
    ...rest,
    className: cn(className, 'animate-in fade-in-0 slide-in-from-top-2', {
      'custom-scrollbar': scrollable,
    }),
  }
  if (!inPortal) return <RadixPopover.Content {...props} />

  return (
    <RadixPopover.Portal>
      <RadixPopover.Content {...props} ref={ref} />
    </RadixPopover.Portal>
  )
})

export const Popover = {
  Root: RadixPopover.Root,
  Anchor: RadixPopover.Anchor,
  Trigger: RadixPopover.Trigger,
  Portal: RadixPopover.Portal,
  Close: RadixPopover.Close,
  Content: PopoverContent,
}
