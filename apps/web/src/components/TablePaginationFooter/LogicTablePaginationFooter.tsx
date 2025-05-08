'use client'

import { GoToPageInput } from '$/components/TablePaginationFooter/GoToPageInput'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
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

  if (isLoading) {
    return (
      <div className='w-full flex justify-between items-center'>
        <Skeleton className='w-20 my-2' height='h4' />
        <Skeleton className='w-12 my-2' height='h4' />
      </div>
    )
  }

  return (
    <div className='w-full flex justify-between items-center'>
      <Text.H5M color='foregroundMuted'>
        {countLabel?.(count) ?? count}
      </Text.H5M>

      <div className='flex items-center'>
        <Button
          size='default'
          variant='ghost'
          disabled={page <= 1}
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
          disabled={page >= totalPages}
          iconProps={{
            name: 'chevronRight',
          }}
          onClick={() => onPageChange(page + 1)}
        />
      </div>
    </div>
  )
}
