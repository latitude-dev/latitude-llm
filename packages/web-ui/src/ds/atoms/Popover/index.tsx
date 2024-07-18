'use client'

import { forwardRef } from 'react'
import * as RadixPopover from '@radix-ui/react-popover'

import { cn } from '$ui/lib/utils'

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
    className: cn(
      className,
      'will-change-[transform,opacity] data-[state=open]:data-[side=top]:animate-slideDownAndFade data-[state=open]:data-[side=right]:animate-slideLeftAndFade data-[state=open]:data-[side=bottom]:animate-slideUpAndFade data-[state=open]:data-[side=left]:animate-slideRightAndFade',
      {
        'custom-scrollbar': scrollable,
      },
    ),
  }
  if (!inPortal) return <RadixPopover.Content {...props} />

  return (
    <RadixPopover.Portal>
      <RadixPopover.Content {...props} ref={ref} />
    </RadixPopover.Portal>
  )
})

namespace Popover {
  export const Root = RadixPopover.Root
  export const Anchor = RadixPopover.Anchor
  export const Trigger = RadixPopover.Trigger
  export const Portal = RadixPopover.Portal
  export const Close = RadixPopover.Close
  export const Content = PopoverContent
}

export default Popover
