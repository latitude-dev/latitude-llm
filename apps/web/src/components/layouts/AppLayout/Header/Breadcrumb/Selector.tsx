'use client'

import { ReactNode, useState } from 'react'
import { isString } from 'lodash-es'

import { Button, Icon, Popover, Text } from '@latitude-data/web-ui'
import Link from 'next/link'

export type BreadcrumbSelectorOption = {
  href: string
  label: string | ReactNode
}

export function BreadcrumbSelector({
  label,
  options,
}: {
  label: string | ReactNode
  options: BreadcrumbSelectorOption[]
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild className='overflow-hidden'>
        <Button variant='ghost' className='hover:bg-muted' ellipsis>
          {isString(label) ? (
            <Text.H5 color='foregroundMuted' noWrap ellipsis>
              {label}
            </Text.H5>
          ) : (
            label
          )}
          <Icon
            name='chevronsUpDown'
            color='foregroundMuted'
            className='min-w-4'
          />
        </Button>
      </Popover.Trigger>
      <Popover.Content
        align='start'
        className='bg-background shadow-lg rounded-lg p-2 max-w-xl mt-4 border border-border z-20'
      >
        <ul className='flex flex-col gap-2'>
          {options.map(({ href, label: optionLabel }, idx) => (
            <li key={idx}>
              <Link href={href}>
                <Button
                  variant='ghost'
                  className='hover:bg-muted'
                  fullWidth
                  ellipsis
                  onClick={() => setIsOpen(false)}
                >
                  <div className='w-full flex flex-start text-start'>
                    {isString(optionLabel) ? (
                      <Text.H5 noWrap ellipsis>
                        {optionLabel}
                      </Text.H5>
                    ) : (
                      optionLabel
                    )}
                  </div>
                </Button>
              </Link>
            </li>
          ))}
        </ul>
      </Popover.Content>
    </Popover.Root>
  )
}
