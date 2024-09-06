import { Text } from '@latitude-data/web-ui'
import Link from 'next/link'

export default function BreadcrumpLink({
  name,
  href,
}: {
  name: string
  href: string
}) {
  return (
    <Link href={href}>
      <Text.H5 color='foregroundMuted'>{name}</Text.H5>
    </Link>
  )
}
