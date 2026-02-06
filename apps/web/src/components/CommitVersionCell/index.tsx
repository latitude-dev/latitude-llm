'use client'

import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'

type CommitInfo = {
  uuid: string
  title: string
  version: number | null
}

function LoadingSkeleton() {
  return (
    <div className='flex flex-row gap-1 items-center'>
      <Skeleton className='h-5 w-10 rounded-full' />
      <Skeleton className='h-4 w-44' />
    </div>
  )
}

export function CommitVersionCell({
  commit,
  textColor = 'foreground',
  isLoading = false,
}: {
  commit?: CommitInfo | null | undefined
  textColor?: 'foreground' | 'destructive'
  isLoading?: boolean
}) {
  if (isLoading) return <LoadingSkeleton />
  if (!commit) return <Text.H5 color='foregroundMuted'>-</Text.H5>

  return (
    <div className='flex flex-row gap-1 items-center truncate'>
      <Badge
        variant={commit.version ? 'accent' : 'muted'}
        className='flex-shrink-0'
      >
        <Text.H6 noWrap>
          {commit.version ? `v${commit.version}` : 'Draft'}
        </Text.H6>
      </Badge>
      <Text.H5 noWrap ellipsis color={textColor}>
        {commit.title}
      </Text.H5>
    </div>
  )
}
