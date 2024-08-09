'use client'

import { HEAD_COMMIT } from '@latitude-data/core/browser'
import { Badge, Text } from '$ui/ds/atoms'

import { ClickToCopy } from '../ClicktoCopy'

export function BreadcrumpBadge({
  uuid: fullUuid,
  title,
  isHead,
}: {
  uuid: string
  title?: string | null
  isHead: boolean
}) {
  const [uuid] = isHead ? [HEAD_COMMIT] : fullUuid.split('-')
  return (
    <div className='flex flex-row items-center space-x-2'>
      <Text.H5M>{title ?? 'Untitled'}</Text.H5M>
      <ClickToCopy copyValue={fullUuid}>
        <Badge variant={isHead ? 'accent' : 'muted'}>{uuid}</Badge>
      </ClickToCopy>
    </div>
  )
}
