import { IPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { Button, Skeleton, Text } from '@latitude-data/web-ui'
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
      disabled={!url}
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
  isLoading = false,
}: {
  pagination?: IPagination
  countLabel?: (count: number) => string
  isLoading?: boolean
}) {
  if (!isLoading && !pagination) return null

  return (
    <div className='w-full flex justify-between items-center'>
      {isLoading ? (
        <Skeleton className='w-20 my-2' height='h4' />
      ) : pagination ? (
        <Text.H5M color='foregroundMuted'>
          {countLabel ? countLabel(pagination.count) : pagination.count}{' '}
        </Text.H5M>
      ) : null}

      {isLoading ? (
        <Skeleton className='w-12 my-2' height='h4' />
      ) : pagination ? (
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
      ) : null}
    </div>
  )
}
