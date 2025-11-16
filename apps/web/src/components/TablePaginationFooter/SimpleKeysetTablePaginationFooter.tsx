'use client'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'

export function SimpleKeysetTablePaginationFooter({
  hasNext,
  hasPrev,
  setNext,
  setPrev,
  count,
  countLabel,
  isLoading,
}: {
  setNext: () => void
  setPrev: () => void
  hasNext: boolean
  hasPrev: boolean
  count: number | null
  countLabel?: (count: number) => string
  isLoading?: boolean
}) {
  return (
    <div className='w-full flex justify-between items-center'>
      <Text.H5M color='foregroundMuted'>
        {count ? (countLabel ? countLabel(count) : `${count} items`) : ''}
      </Text.H5M>
      <div className='flex items-center'>
        {isLoading && (
          <Icon name='loader' className='h-4 w-4 animate-spin mr-2' />
        )}
        <Button
          size='default'
          variant='ghost'
          disabled={!hasPrev || isLoading}
          iconProps={{ name: 'chevronLeft' }}
          onClick={setPrev}
        />
        <Button
          size='default'
          variant='ghost'
          disabled={!hasNext || isLoading}
          iconProps={{ name: 'chevronRight' }}
          onClick={setNext}
        />
      </div>
    </div>
  )
}
