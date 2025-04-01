import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import Link from 'next/link'

export default function BreadcrumbLink({
  name,
  href,
  showBackIcon,
}: {
  name: string
  href: string
  showBackIcon?: boolean
}) {
  return (
    <Link
      href={href}
      className='flex flex-row items-center gap-2 overflow-hidden flex-shrink-0'
    >
      {showBackIcon && <Icon name='chevronLeft' color='foregroundMuted' />}
      <Text.H5 noWrap ellipsis color='foregroundMuted'>
        {name}
      </Text.H5>
    </Link>
  )
}
