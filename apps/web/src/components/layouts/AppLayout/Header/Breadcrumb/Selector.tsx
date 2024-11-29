'use client'

import { ReactNode, useState } from 'react'
import { isString } from 'lodash-es'

import { Button, Popover, Text } from '@latitude-data/web-ui'
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
      <Popover.ButtonTrigger buttonVariant='ghost' className='hover:bg-muted'>
        {label}
      </Popover.ButtonTrigger>
      <Popover.Content align='start' size='small'>
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
