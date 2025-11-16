'use client'

import { GoToPageInput } from '$/components/TablePaginationFooter/GoToPageInput'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { useMemo } from 'react'

export function LogicTablePaginationFooter({
  page,
  pageSize,
  count,
  countLabel,
  onPageChange,
  isLoading,
}: {
  page: number
  pageSize: number
  count: number
  countLabel?: (count: number) => string
  onPageChange: (page: number) => void
  isLoading?: boolean
}) {
  const totalPages = useMemo(
    () => Math.ceil(count / pageSize),
    [count, pageSize],
  )

  return (
    <div className='w-full flex justify-between items-center'>
      <Text.H5M color='foregroundMuted'>
        {countLabel?.(count) ?? count}
      </Text.H5M>

      <div className='flex items-center'>
        {isLoading && (
          <Icon name='loader' className='h-4 w-4 animate-spin mr-2' />
        )}
        <Button
          size='default'
          variant='ghost'
          disabled={page <= 1 || isLoading}
          iconProps={{
            name: 'chevronLeft',
          }}
          onClick={() => onPageChange(page - 1)}
        />
        <div className='flex flex-row items-center gap-x-1'>
          <Text.H5M color='foregroundMuted'>Page</Text.H5M>
          <div className='max-w-14'>
            <GoToPageInput
              key={page}
              page={page}
              totalPages={totalPages}
              pageSize={pageSize}
              onPageChange={onPageChange}
            />
          </div>
          <Text.H5M color='foregroundMuted'>of {totalPages}</Text.H5M>
        </div>
        <Button
          size='default'
          variant='ghost'
          disabled={page >= totalPages || isLoading}
          iconProps={{
            name: 'chevronRight',
          }}
          onClick={() => onPageChange(page + 1)}
        />
      </div>
    </div>
  )
}
