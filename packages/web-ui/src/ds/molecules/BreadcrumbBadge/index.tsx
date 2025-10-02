'use client'
import { HEAD_COMMIT } from '@latitude-data/core/constants'

import { Badge } from '../../atoms/Badge'
import { Text } from '../../atoms/Text'
import { ClickToCopy } from '../ClickToCopy'

export function BreadcrumbBadge({
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
