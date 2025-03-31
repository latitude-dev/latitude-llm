'use client'
import { useMemo } from 'react'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { GoToPageInput } from '$/components/TablePaginationFooter/GoToPageInput'

export function LogicTablePaginationFooter({
  totalCount,
  page,
  pageSize,
  totalCountLabel,
  onPageChange,
}: {
  page: number
  totalCount: number
  pageSize: number
  totalCountLabel?: string
  onPageChange: (page: number) => void
}) {
  const totalPages = useMemo(
    () => Math.ceil(totalCount / pageSize),
    [totalCount, pageSize],
  )

  return (
    <div className='w-full flex justify-between items-center'>
      <Text.H5M color='foregroundMuted'>
        {totalCountLabel ?? totalCount}{' '}
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
