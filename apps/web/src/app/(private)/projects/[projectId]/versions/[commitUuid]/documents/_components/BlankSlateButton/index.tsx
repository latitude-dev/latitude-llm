'use client'

import Link from 'next/link'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'

function InnerButton({
  title,
  description,
  onClick,
}: {
  title: string
  description: string
  href?: string
  onClick?: () => void
}) {
  return (
    <Button fancy variant='outline' fullWidth onClick={onClick}>
      <div className='flex flex-col gap-1 px-1 py-2'>
        <Text.H4M>{title}</Text.H4M>
        <Text.H5 color='foregroundMuted'>{description}</Text.H5>
      </div>
    </Button>
  )
}

export function BlankSlateButton({
  title,
  description,
  href,
  onClick,
}: {
  title: string
  description: string
  href?: string
  onClick?: () => void
}) {
  if (href) {
    return (
      <Link href={href}>
        <InnerButton title={title} description={description} />
      </Link>
    )
  }
  return <InnerButton title={title} description={description} onClick={onClick} />
}
