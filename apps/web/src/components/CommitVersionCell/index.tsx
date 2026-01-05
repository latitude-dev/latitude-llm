'use client'

import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Text } from '@latitude-data/web-ui/atoms/Text'

type CommitInfo = {
  uuid: string
  title: string
  version: number | null
}

export function CommitVersionCell({
  commit,
  textColor = 'foreground',
}: {
  commit: CommitInfo | null
  textColor?: 'foreground' | 'destructive'
}) {
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
