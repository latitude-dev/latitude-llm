import { ReactNode, useState } from 'react'

import { Popover } from '@latitude-data/web-ui'

export function FilterButton({
  label,
  color,
  children,
}: {
  label: string
  color: 'primary' | 'foregroundMuted' | 'destructive'
  children: ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.ButtonTrigger color={color}>{label}</Popover.ButtonTrigger>
      <Popover.Content align='end' scrollable size='large'>
        {children}
      </Popover.Content>
    </Popover.Root>
  )
}
