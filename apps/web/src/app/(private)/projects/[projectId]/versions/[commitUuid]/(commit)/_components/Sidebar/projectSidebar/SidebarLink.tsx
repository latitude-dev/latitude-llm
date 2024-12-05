'use client'

import { cn, Icon, IconName, Text } from '@latitude-data/web-ui'
import Link from 'next/link'

interface SidebarLinkProps {
  href: string
  icon: IconName
  label: string
  isSelected: boolean
}

export function SidebarLink({
  href,
  icon,
  label,
  isSelected,
}: SidebarLinkProps) {
  return (
    <div
      className={cn('flex flex-row gap-2 items-center pl-6', {
        'bg-accent': isSelected,
      })}
    >
      <Icon name={icon} color={isSelected ? 'primary' : 'foreground'} />
      <Link href={href}>
        <Text.H5M color={isSelected ? 'primary' : 'foreground'}>
          {label}
        </Text.H5M>
      </Link>
    </div>
  )
}
