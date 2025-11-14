'use client'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'

export function SimpleKeysetTablePaginationFooter({
  hasNext,
  hasPrev,
  setNext,
  setPrev,
  count,
  countLabel,
}: {
  setNext: () => void
  setPrev: () => void
  hasNext: boolean
  hasPrev: boolean
  count: number | null
  countLabel?: (count: number) => string
}) {
  return (
    <div className='w-full flex justify-between items-center'>
      <Text.H5M color='foregroundMuted'>
        {count ? (countLabel ? countLabel(count) : `${count} items`) : ''}
      </Text.H5M>
      <div className='flex items-center'>
        <Button
          size='default'
          variant='ghost'
          disabled={!hasPrev}
          iconProps={{ name: 'chevronLeft' }}
          onClick={setPrev}
        />
        <Button
          size='default'
          variant='ghost'
          disabled={!hasNext}
          iconProps={{ name: 'chevronRight' }}
          onClick={setNext}
        />
      </div>
    </div>
  )
}
