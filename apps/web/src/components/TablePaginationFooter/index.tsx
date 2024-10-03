import { IPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { Button, Text } from '@latitude-data/web-ui'
import { GoToPageInput } from '$/components/TablePaginationFooter/GoToPageInput'
import Link from 'next/link'

function NavLink({
  url,
  direction,
}: {
  url?: string
  direction: 'prev' | 'next'
}) {
  const button = (
    <Button
      size='default'
      variant='ghost'
      iconProps={{
        name: direction === 'prev' ? 'chevronLeft' : 'chevronRight',
      }}
    />
  )
  if (!url) return button

  return <Link href={url}>{button}</Link>
}

export function LinkableTablePaginationFooter({
  pagination,
  countLabel,
}: {
  pagination: IPagination
  countLabel?: (count: number) => string
}) {
  return (
    <div className='w-full flex justify-between items-center'>
      <Text.H5M color='foregroundMuted'>
        {countLabel ? countLabel(pagination.count) : pagination.count}{' '}
      </Text.H5M>

      <div className='flex items-center'>
        <NavLink url={pagination.prevPage?.url} direction='prev' />
        <div className='flex flex-row items-center gap-x-1'>
          <Text.H5M color='foregroundMuted'>Page</Text.H5M>
          <div className='max-w-14'>
            <GoToPageInput
              key={pagination.page}
              page={pagination.page}
              totalPages={pagination.totalPages}
              pageSize={pagination.pageSize}
              baseUrl={pagination.baseUrl}
            />
          </div>
          <Text.H5M color='foregroundMuted'>
            of {pagination.totalPages}
          </Text.H5M>
        </div>
        <NavLink url={pagination.nextPage?.url} direction='next' />
      </div>
    </div>
  )
}
