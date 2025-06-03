import { IPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { GoToPageInput } from '$/components/TablePaginationFooter/GoToPageInput'
import Link from 'next/link'

type Props = {
  pagination?: IPagination
  countLabel?: (count: number) => string
  isLoading?: boolean
}
function CountLabel({
  count,
  isLoading = false,
  countLabel = (count: number) => `${count} rows`,
}: {
  isLoading?: boolean
  count?: number | typeof Infinity
  countLabel?: Props['countLabel']
}) {
  if (isLoading) return <Skeleton className='w-20 my-2' height='h4' />
  if (count === undefined || count === Infinity) return <span />

  if (!countLabel) {
    return <Text.H5M color='foregroundMuted'>{count} rows</Text.H5M>
  }

  return <Text.H5M color='foregroundMuted'>{countLabel(count)} </Text.H5M>
}

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
}: Props) {
  if (!isLoading && !pagination) return null

  return (
    <div className='w-full flex justify-between items-center'>
      <CountLabel
        count={pagination?.count}
        isLoading={isLoading}
        countLabel={countLabel}
      />

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
            {pagination.count !== Infinity ? (
              <Text.H5M color='foregroundMuted'>
                of {pagination.totalPages}
              </Text.H5M>
            ) : null}
          </div>
          <NavLink url={pagination.nextPage?.url} direction='next' />
        </div>
      ) : null}
    </div>
  )
}
