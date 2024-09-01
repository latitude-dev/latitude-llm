import { Text } from '@latitude-data/web-ui'
import Link from 'next/link'

export default function BreadcrumpLInk({
  name,
  href,
}: {
  name: string
  href: string
}) {
  return (
    <Link href={href}>
      <Text.H5M>{name}</Text.H5M>
    </Link>
  )
}
