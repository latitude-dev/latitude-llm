'use client'

import { Button, Text } from '@latitude-data/web-ui'

export function LogicTablePaginationFooterWithoutCount({
  page,
  onPageChange,
  nextPage = false,
}: {
  page: number
  onPageChange: (page: number) => void
  nextPage?: boolean
}) {
  return (
    <div className='w-full flex justify-between items-center'>
      <div />
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
          <Text.H5M color='foregroundMuted'>{page}</Text.H5M>
        </div>
        <Button
          size='default'
          variant='ghost'
          disabled={!nextPage}
          iconProps={{
            name: 'chevronRight',
          }}
          onClick={() => onPageChange(page + 1)}
        />
      </div>
    </div>
  )
}
