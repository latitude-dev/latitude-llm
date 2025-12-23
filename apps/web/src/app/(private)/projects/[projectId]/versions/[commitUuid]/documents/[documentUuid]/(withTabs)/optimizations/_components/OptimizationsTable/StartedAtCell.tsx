'use client'

import { relativeTime } from '$/lib/relativeTime'
import { Text } from '@latitude-data/web-ui/atoms/Text'

export function StartedAtCell({
  createdAt,
  hasError,
}: {
  createdAt: Date
  hasError: boolean
}) {
  return (
    <Text.H5
      noWrap
      color={hasError ? 'destructive' : 'foreground'}
      userSelect={false}
    >
      <time dateTime={new Date(createdAt).toISOString()}>
        {relativeTime(new Date(createdAt))}
      </time>
    </Text.H5>
  )
}
