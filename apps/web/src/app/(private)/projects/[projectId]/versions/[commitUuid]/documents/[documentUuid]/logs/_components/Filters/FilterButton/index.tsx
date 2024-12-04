import { ReactNode, useState } from 'react'

import { Button, Icon, Popover, Text } from '@latitude-data/web-ui'

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
      <Popover.Trigger asChild className='overflow-hidden'>
        <div className='flex flex-row'>
          <Button variant='outline' ellipsis fullWidth className='w-full'>
            <div className='flex flex-row justify-between items-center w-full'>
              <Text.H5 noWrap ellipsis color={color}>
                {label}
              </Text.H5>
              <Icon
                name='chevronsUpDown'
                color='foregroundMuted'
                size='small'
              />
            </div>
          </Button>
        </div>
      </Popover.Trigger>
      <Popover.Content
        align='start'
        className='bg-background shadow-lg rounded-lg p-2 flex flex-col gap-4 max-w-xl mt-1 border border-border z-20 max-h-96 overflow-y-auto'
      >
        {children}
      </Popover.Content>
    </Popover.Root>
  )
}
